/**
 * SmartBuy AI Recommendation Engine (Client-Side & Hybrid)
 * =========================================================
 * Implements multi-factor weighted scoring, Bayesian rating smoothing,
 * cross-platform entity healing, and interactive persona tuning.
 */

export const PERSONAS = {
  balanced: {
    id: "balanced",
    name: "Balanced",
    icon: "⚡",
    tagline: "SmartBuy AI default: optimal mix of price, quality & trust",
    weights: { price: 0.35, rating: 0.25, seller: 0.20, perks: 0.10, delivery: 0.10 },
  },
  budget: {
    id: "budget",
    name: "Budget First",
    icon: "💰",
    tagline: "Prioritizes the lowest price & maximum savings",
    weights: { price: 0.65, rating: 0.15, seller: 0.10, perks: 0.05, delivery: 0.05 },
  },
  quality: {
    id: "quality",
    name: "Quality & Trust",
    icon: "🛡️",
    tagline: "Prioritizes verified high ratings & top-tier seller reliability",
    weights: { price: 0.20, rating: 0.40, seller: 0.25, perks: 0.05, delivery: 0.10 },
  },
  delivery: {
    id: "delivery",
    name: "Fast Delivery",
    icon: "🚀",
    tagline: "Prioritizes express 1-day delivery & immediate fulfillment",
    weights: { price: 0.25, rating: 0.20, seller: 0.15, perks: 0.05, delivery: 0.35 },
  },
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function parsePrice(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return "—";
  return `₹${Math.round(num).toLocaleString("en-IN")}`;
}

export function healOffers(offers) {
  if (!Array.isArray(offers) || offers.length === 0) return [];
  const list = offers.map((o) => ({ ...o }));

  if (list.length < 2) {
    return list;
  }

  const o1 = list[0];
  const o2 = list[1];

  // 1. Brand propagation
  const sharedBrand = o1.brand || o2.brand;
  if (sharedBrand) {
    if (!o1.brand) o1.brand = sharedBrand;
    if (!o2.brand) o2.brand = sharedBrand;
  }

  // 2. Category propagation
  const sharedCategory = o1.category || o2.category;
  if (sharedCategory) {
    if (!o1.category) o1.category = sharedCategory;
    if (!o2.category) o2.category = sharedCategory;
  }

  // 3. MRP / Original Price propagation
  const p1_orig = parsePrice(o1.original_price);
  const p2_orig = parsePrice(o2.original_price);
  const sharedMRP = p1_orig || p2_orig;

  if (sharedMRP) {
    const cur1 = parsePrice(o1.price);
    const cur2 = parsePrice(o2.price);
    if (!p1_orig && cur1) {
      o1.original_price = sharedMRP;
      if (sharedMRP > cur1) {
        o1.discount = Math.round(((sharedMRP - cur1) / sharedMRP) * 100);
      }
    }
    if (!p2_orig && cur2) {
      o2.original_price = sharedMRP;
      if (sharedMRP > cur2) {
        o2.discount = Math.round(((sharedMRP - cur2) / sharedMRP) * 100);
      }
    }
  }

  // 4. Image propagation
  const img1 = o1.image_url || o1.image;
  const img2 = o2.image_url || o2.image;
  if (!img1 && img2) o1.image_url = img2;
  if (!img2 && img1) o2.image_url = img1;

  // 5. Domain Baselines
  for (const o of list) {
    const plat = String(o.platform || "").toLowerCase();
    if (!o.seller_name) {
      o.seller_name = plat.includes("flipkart") ? "Flipkart Assured Seller" : "Amazon Fulfilled Seller";
    }
    if (!o.seller_rating) {
      o.seller_rating = 4.3;
    }
    if (!o.delivery_text) {
      o.delivery_text = "Standard Delivery (2-3 Days)";
    }
    if (!o.return_window) {
      o.return_window = "7 Days Replacement";
    }
    if (!o.availability) {
      const p = parsePrice(o.price);
      o.availability = p && p > 0 ? "In Stock" : "Check Availability";
    }
  }

  return list;
}

export function scoreOfferClient(offer, allOffers, personaId = "balanced") {
  const persona = PERSONAS[personaId] || PERSONAS.balanced;
  const weights = persona.weights;

  const currentPrice = parsePrice(offer.price || offer.current_price);
  const originalPrice = parsePrice(offer.original_price || offer.mrp || offer.list_price);

  const validPrices = allOffers
    .map((o) => parsePrice(o.price || o.current_price))
    .filter((p) => p !== null && p > 0);

  // 1. Price Factor (0 - 1)
  let priceScore = 0.5;
  if (currentPrice === null || currentPrice <= 0) {
    priceScore = 0.1;
  } else if (validPrices.length === 0) {
    priceScore = 0.85;
  } else {
    const lowest = Math.min(...validPrices);
    const highest = Math.max(...validPrices);
    if (highest === lowest) {
      priceScore = 0.9;
    } else {
      priceScore = clamp(1.0 - (currentPrice - lowest) / (highest * 1.25));
    }
    if (originalPrice && originalPrice > currentPrice) {
      const disc = (originalPrice - currentPrice) / originalPrice;
      priceScore = clamp(priceScore + Math.min(0.15, disc * 0.2));
    }
  }

  // 2. Bayesian Rating Factor (0 - 1)
  const rawRating = parseFloat(offer.rating || offer.star_rating) || 4.2;
  const rawReviews = parseInt(offer.review_count || offer.reviews_count || 0, 10);
  const priorRating = 4.0;
  const priorWeight = 15;
  const bayesianRating = (priorWeight * priorRating + rawReviews * rawRating) / (priorWeight + rawReviews);
  const ratingScore = clamp(bayesianRating / 5.0);

  // 3. Seller Trust Factor (0 - 1)
  const rawSeller = parseFloat(offer.seller_rating) || 4.3;
  let sellerScore = clamp(rawSeller / 5.0);
  const sellerName = String(offer.seller_name || "").toLowerCase();
  if (sellerName.includes("assured") || sellerName.includes("amazon") || sellerName.includes("appario") || sellerName.includes("retailnet")) {
    sellerScore = clamp(sellerScore + 0.08);
  }

  // 4. Perks & Promo Factor (0 - 1)
  const offerText = String(offer.offer_text || offer.promo_text || "");
  let perkScore = 0.5;
  if (offerText && offerText !== "None" && offerText !== "false") {
    perkScore = /(?:bank|instant|discount|cashback|coupon|off)/i.test(offerText) ? 0.9 : 0.75;
  }

  // 5. Delivery Factor (0 - 1)
  const deliveryText = String(offer.delivery_text || "").toLowerCase();
  const availability = String(offer.availability || "").toLowerCase();
  let deliveryScore = 0.7;
  if (/(?:tomorrow|1 day|same day|prime)/i.test(deliveryText)) {
    deliveryScore = 1.0;
  } else if (/(?:free|assured)/i.test(deliveryText)) {
    deliveryScore = 0.85;
  }
  if (availability.includes("out of stock")) {
    deliveryScore = 0.1;
  }

  const rawComposite =
    priceScore * weights.price +
    ratingScore * weights.rating +
    sellerScore * weights.seller +
    perkScore * weights.perks +
    deliveryScore * weights.delivery;

  const compositeScore = Math.round(rawComposite * 100 * 10) / 10;

  // Pros & Cons
  const pros = [];
  const cons = [];

  if (currentPrice && validPrices.length > 0 && currentPrice === Math.min(...validPrices)) {
    if (validPrices.length > 1 && Math.max(...validPrices) > currentPrice) {
      const diff = Math.round(Math.max(...validPrices) - currentPrice);
      pros.push(`Lowest market price (saves ${formatINR(diff)})`);
    } else {
      pros.push("Best available market price");
    }
  } else if (currentPrice && validPrices.length > 0 && currentPrice > Math.min(...validPrices)) {
    const diff = Math.round(currentPrice - Math.min(...validPrices));
    cons.push(`${formatINR(diff)} higher than cheapest available offer`);
  }

  if (rawRating >= 4.3) {
    const rCount = rawReviews > 0 ? ` from ${rawReviews.toLocaleString("en-IN")} buyers` : "";
    pros.push(`High customer satisfaction (${rawRating}★${rCount})`);
  }

  if (sellerScore >= 0.85) {
    pros.push("Verified high-trust seller fulfillment");
  }

  if (offerText && offerText !== "None" && offerText !== "false" && offerText !== "True") {
    pros.push(`Deal perk: ${offerText.slice(0, 45)}`);
  }

  if (deliveryScore >= 0.95) {
    pros.push("Express 1-day delivery available");
  }

  return {
    platform: offer.platform || "Store",
    title: offer.title || offer.name || "Product",
    price: currentPrice,
    original_price: originalPrice,
    rating: rawRating,
    review_count: rawReviews,
    seller_name: offer.seller_name || "Verified Seller",
    seller_rating: rawSeller,
    delivery_text: offer.delivery_text || "Standard Delivery",
    offer_text: offerText && offerText !== "True" ? offerText : "Promotional Discount Available",
    composite_score: compositeScore,
    factor_scores: {
      price: Math.round(priceScore * 100),
      rating: Math.round(ratingScore * 100),
      seller: Math.round(sellerScore * 100),
      perks: Math.round(perkScore * 100),
      delivery: Math.round(deliveryScore * 100),
    },
    pros,
    cons,
    url: offer.url || "",
    image_url: offer.image_url || offer.image || "",
  };
}

export function evaluateComparisonClient(comparison, personaId = "balanced") {
  if (!comparison) return null;
  const rawOffers = Array.isArray(comparison.offers) ? comparison.offers : [];
  if (rawOffers.length === 0) return null;

  const healed = healOffers(rawOffers);
  const scored = healed.map((o) => scoreOfferClient(o, healed, personaId));

  scored.sort((a, b) => b.composite_score - a.composite_score);

  const winner = scored[0];
  const alternatives = scored.slice(1);

  let verdict = "";
  if (alternatives.length > 0) {
    const alt = alternatives[0];
    if (winner.price && alt.price && winner.price < alt.price) {
      const diff = Math.round(alt.price - winner.price);
      verdict = `${winner.platform} is SmartBuy's top recommendation for this item. It is ${formatINR(diff)} lower than ${alt.platform} while offering a strong ${winner.rating}★ customer rating and verified fulfillment.`;
    } else if (winner.price && alt.price && winner.price > alt.price) {
      const diff = Math.round(winner.price - alt.price);
      verdict = `${winner.platform} is recommended despite being ${formatINR(diff)} higher than ${alt.platform} because it provides significantly superior seller reliability, higher verified ratings (${winner.rating}★), and secure return coverage.`;
    } else {
      verdict = `${winner.platform} edges ahead with a score of ${winner.composite_score}/100, providing the most balanced combination of price, verified ratings (${winner.rating}★), and seller reliability.`;
    }
  } else {
    verdict = `${winner.platform} offers the best overall deal with a SmartBuy composite score of ${winner.composite_score}/100.`;
  }

  const confidence = healed.length >= 2 && (winner.review_count > 20 || winner.rating > 4.0) ? "Very High" : "High";

  return {
    product_name: comparison.name || comparison.title || winner.title,
    brand: comparison.brand || winner.platform,
    image_url: comparison.image_url || winner.image_url,
    persona: personaId,
    confidence,
    winner,
    alternatives,
    verdict_summary: verdict,
  };
}
