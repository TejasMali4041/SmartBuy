"""
SmartBuy AI Recommendation Service
===================================
Powered by Google Gemini API with resilient fallback to the rule-based engine.

Features:
- Context-aware multi-factor e-commerce evaluation (Price, Rating Confidence,
  Seller Reliability, Delivery Speed, Value-Adds/Bank Offers).
- Persona-conditioned reasoning (Balanced, Budget First, Quality First, Fast Delivery).
- Generates natural, human-like verdicts that analyze real monetary and trust tradeoffs.
- Strict JSON schema responses.
- In-memory LRU caching to minimize API latency and protect free-tier rate limits.
- Zero-downtime graceful fallback: if GEMINI_API_KEY is missing, rate-limited,
  or network fails, seamlessly falls back to the deterministic rule-based engine.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Union

from services.recommendation import (
    PERSONA_WEIGHTS,
    analyze_recommendation as rule_based_analyze,
    score_offer as rule_based_score_offer,
    _get_val,
    _parse_price,
)

logger = logging.getLogger(__name__)

# Cache store: cache_key -> (timestamp, result_dict)
_RECOMMENDATION_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _generate_cache_key(comparison_name: str, offers: List[Any], persona: str) -> str:
    """Generate a consistent cache key based on comparison content and persona."""
    key_parts = [comparison_name.strip().lower(), persona.strip().lower()]
    for o in offers:
        plat = str(_get_val(o, "platform", default=""))
        p = str(_parse_price(_get_val(o, "price", "current_price", "sale_price")) or "")
        r = str(_get_val(o, "rating", "star_rating", default=""))
        key_parts.append(f"{plat}:{p}:{r}")
    return "|".join(key_parts)


def _get_gemini_client():
    """Initialize and return Google GenAI client and ordered list of candidate models."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None, []

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=12000,
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        preferred = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest").strip()
        candidates = [m for m in ["gemini-flash-lite-latest", preferred, "gemini-flash-latest", "gemini-3.8-flash"] if m]
        seen = set()
        unique_models = [m for m in candidates if not (m in seen or seen.add(m))]
        return client, unique_models
    except Exception as exc:
        logger.warning(f"[SmartBuy AI] Failed to initialize Gemini client: {exc}")
        return None, []


def _build_prompt_payload(comparison_name: str, offers: List[Any], persona: str) -> str:
    """Prepare clean structured JSON string for Gemini context."""
    persona_descriptions = {
        "balanced": "Balanced shopper seeking best overall value, weighing price, rating, seller trust and delivery equally.",
        "budget": "Price-sensitive shopper who wants the lowest price and maximum savings above all else.",
        "quality": "Quality & trust-oriented shopper who prioritizes verified high ratings, review depth, and genuine seller fulfillment.",
        "delivery": "Urgent shopper who prioritizes 1-day/same-day delivery, Prime/Assured status, and prompt fulfillment.",
    }

    cleaned_offers = []
    for idx, o in enumerate(offers):
        price = _parse_price(_get_val(o, "price", "current_price", "sale_price"))
        mrp = _parse_price(_get_val(o, "original_price", "mrp", "list_price"))
        raw_r = _get_val(o, "rating", "star_rating")
        try:
            rating = float(raw_r) if raw_r is not None else None
        except (ValueError, TypeError):
            rating = None

        reviews = _get_val(o, "review_count", "reviews", default=0)
        try:
            reviews_count = int(reviews or 0)
        except (ValueError, TypeError):
            reviews_count = 0

        seller = str(_get_val(o, "seller_name", default="Verified Seller"))
        delivery = str(_get_val(o, "delivery_text", default="Standard Delivery"))
        offer_text = _get_val(o, "offer_text", "promo_text", "deal_text")

        cleaned_offers.append({
            "index": idx,
            "platform": _get_val(o, "platform", default="Store"),
            "title": _get_val(o, "title", "name", default="Product"),
            "price_inr": price,
            "mrp_inr": mrp,
            "customer_rating": rating,
            "review_count": reviews_count,
            "seller_name": seller,
            "delivery_info": delivery,
            "promotions_or_bank_offers": str(offer_text) if offer_text and offer_text not in (True, "True") else None,
        })

    prompt_data = {
        "product_target": comparison_name,
        "shopper_persona": persona,
        "persona_goal": persona_descriptions.get(persona, persona_descriptions["balanced"]),
        "marketplace_offers": cleaned_offers,
    }

    return json.dumps(prompt_data, indent=2)


AI_RECOMMENDATION_SYSTEM_INSTRUCTION = """
You are SmartBuy AI, an elite, unbiased e-commerce shopping analyst and recommendation intelligence.
Your task is to analyze competitive product listings from Amazon, Flipkart, and other Indian marketplaces.

Rules for evaluation:
1. PRICE & SAVINGS: Calculate the real rupee difference. Note if one platform offers significant savings.
2. RATING RELIABILITY: A 5.0 rating with only 3 reviews is far less credible than a 4.5 rating with 5,000 verified reviews. Weight review sample size heavily.
3. SELLER & FULFILLMENT: Prioritize authorized/assured sellers (e.g., Appario, RetailNet, Flipkart Assured, Amazon Fulfilled) over unrated third parties.
4. DELIVERY & CONVENIENCE: Value fast delivery (1-day, Prime, express) according to the user persona.
5. CONTEXTUAL REASONING: Explain the trade-offs naturally (e.g., "Flipkart is ₹450 cheaper, but Amazon has 10x more reviews and 1-day Prime delivery").

Output strictly valid JSON with this exact schema:
{
  "winner_index": 0,
  "confidence": "Very High" | "High" | "Medium",
  "verdict_summary": "Crisp 2-3 sentence verdict clearly naming the recommended platform and explaining the monetary and quality tradeoffs.",
  "tradeoff_analysis": "One clear sentence explaining the specific tradeoff (e.g. paying slightly more for better reliability vs saving money).",
  "offer_scores": [
    {
      "index": 0,
      "composite_score": 88.5,
      "factor_scores": {
        "price": 95,
        "rating": 85,
        "seller": 90,
        "perks": 70,
        "delivery": 90
      },
      "pros": ["Lowest available market price (saves ₹450)", "Flipkart Assured fulfillment"],
      "cons": ["Standard 2-3 days delivery"]
    }
  ]
}
"""


def analyze_recommendation_with_gemini(
    comparison_or_offers: Union[Dict[str, Any], List[Any]],
    persona: str = "balanced",
) -> Dict[str, Any]:
    """
    Main entry point for AI recommendations.
    Attempts Gemini reasoning; seamlessly falls back to rule-based engine on failure.
    """
    # Normalize input into offers list and product name
    if isinstance(comparison_or_offers, dict):
        offers = comparison_or_offers.get("offers", [])
        comparison_name = comparison_or_offers.get("name") or comparison_or_offers.get("title") or "Product"
        comparison_image = comparison_or_offers.get("image_url")
    else:
        offers = comparison_or_offers
        comparison_name = "Product"
        comparison_image = None

    if not offers:
        return {
            "winner": None,
            "alternatives": [],
            "verdict_summary": "No offers available to evaluate.",
            "confidence": "Low",
            "ai_powered": False,
        }

    # Check cache
    cache_key = _generate_cache_key(comparison_name, offers, persona)
    cached = _RECOMMENDATION_CACHE.get(cache_key)
    if cached:
        timestamp, cached_result = cached
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            return cached_result

    # Try Gemini AI evaluation
    client, candidate_models = _get_gemini_client()
    if client and candidate_models:
        try:
            from google.genai import types

            payload_json = _build_prompt_payload(comparison_name, offers, persona)
            prompt = (
                f"{AI_RECOMMENDATION_SYSTEM_INSTRUCTION}\n\n"
                f"Evaluate the following product comparison input and return the specified JSON:\n"
                f"{payload_json}"
            )

            response = None
            active_model = None

            for m_candidate in candidate_models:
                try:
                    response = client.models.generate_content(
                        model=m_candidate,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                            max_output_tokens=650,
                            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                        ),
                    )
                    if response and response.text:
                        active_model = m_candidate
                        break
                except Exception as m_err:
                    logger.info(f"[SmartBuy AI] Model {m_candidate} unavailable ({m_err}), trying next candidate...")

            if not response or not response.text:
                raise RuntimeError("All Gemini model candidates failed or returned empty text.")

            raw_text = response.text.strip()
            # Clean possible markdown fence if any
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text)

            ai_data = json.loads(raw_text)

            # Map AI output back to rich offer structures
            winner_idx = int(ai_data.get("winner_index", 0))
            offer_scores_map = {item.get("index"): item for item in ai_data.get("offer_scores", [])}

            # Build enriched offer objects by combining base offer fields with AI scores
            enriched_offers = []
            for idx, orig_offer in enumerate(offers):
                # Baseline rule score for default fallbacks
                base_scored = rule_based_score_offer(orig_offer, offers, persona=persona)
                ai_score_info = offer_scores_map.get(idx, {})

                composite = float(ai_score_info.get("composite_score", base_scored["composite_score"]))
                factor_scores = ai_score_info.get("factor_scores") or base_scored["factor_scores"]
                pros = ai_score_info.get("pros") or base_scored["pros"]
                cons = ai_score_info.get("cons") or base_scored["cons"]

                enriched_offer = {
                    **base_scored,
                    "composite_score": round(composite, 1),
                    "factor_scores": factor_scores,
                    "pros": pros,
                    "cons": cons,
                }
                enriched_offers.append(enriched_offer)

            # Separate winner and alternatives
            winner = enriched_offers[winner_idx] if 0 <= winner_idx < len(enriched_offers) else enriched_offers[0]
            alternatives = [o for i, o in enumerate(enriched_offers) if i != winner_idx]
            # Sort alternatives by composite score descending
            alternatives.sort(key=lambda x: x["composite_score"], reverse=True)

            result = {
                "product_name": comparison_name,
                "image_url": comparison_image or winner.get("image_url"),
                "persona": persona,
                "confidence": ai_data.get("confidence", "High"),
                "winner": winner,
                "alternatives": alternatives,
                "verdict_summary": ai_data.get("verdict_summary") or "",
                "tradeoff_analysis": ai_data.get("tradeoff_analysis") or "",
                "ai_powered": True,
                "model_used": active_model or "gemini",
            }

            # Cache the successful AI result
            _RECOMMENDATION_CACHE[cache_key] = (time.time(), result)
            return result

        except Exception as exc:
            logger.warning(f"[SmartBuy AI] Gemini recommendation failed, falling back to rule engine: {exc}")

    # Fallback: Rule-based recommendation engine
    base_result = rule_based_analyze(comparison_or_offers, persona=persona)
    base_result["ai_powered"] = False
    base_result["fallback_reason"] = "Gemini API unavailable or key not configured"

    _RECOMMENDATION_CACHE[cache_key] = (time.time(), base_result)
    return base_result
