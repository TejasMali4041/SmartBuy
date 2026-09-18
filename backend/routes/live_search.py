from flask import Blueprint, request, jsonify

from services.live_search import live_search

live_search_bp = Blueprint(
    "live_search",
    __name__,
    url_prefix="/api/search",
)


@live_search_bp.route("/live", methods=["GET"])
def live_search_route():
    query = request.args.get("q", "").strip()
    pages = request.args.get("pages", 1, type=int)
    min_score = request.args.get("min_score", 62, type=int)

    if not query:
        return jsonify({
            "success": False,
            "stage": "validation",
            "error": "Search query is required",
        }), 400

    pages = max(1, min(pages, 3))
    min_score = max(0, min(min_score, 100))

    try:
        result = live_search(
            query,
            pages=pages,
            min_score=min_score,
        )

        if result.get("success") is True:
            return jsonify(result), 200

        return jsonify(result), 422

    except ValueError as exc:
        return jsonify({
            "success": False,
            "stage": "validation",
            "error": str(exc),
        }), 400

    except Exception as exc:
        print("[SmartBuy] Live search error:", exc)

        return jsonify({
            "success": False,
            "stage": "matcher",
            "error": "Live product search failed",
            "details": str(exc),
        }), 500
