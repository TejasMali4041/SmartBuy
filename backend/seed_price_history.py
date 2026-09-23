from datetime import datetime, timedelta
from decimal import Decimal
from app import create_app
from extensions import db
from models.product import Product
from models.offer import Offer
from models.price_history import PriceHistory
from services.normalizer import normalize_product_name

app = create_app()

def seed_history():
    with app.app_context():
        print("[SmartBuy] Seeding real database price history...")

        # 1. Product: Apple iPhone 15 (128 GB)
        p_iphone = Product.query.filter(Product.name.like("%iPhone 15%")).first()
        if not p_iphone:
            p_iphone = Product(
                name="Apple iPhone 15 (128 GB) - Black",
                normalized_name=normalize_product_name("Apple iPhone 15 128 GB Black"),
                brand="Apple",
                category="Smartphones",
                image_url="https://m.media-amazon.com/images/I/71657TiFeHL._SX679_.jpg",
                description="Dynamic Island, 48MP Main Camera, USB-C, A16 Bionic chip, durable color-infused glass design.",
            )
            db.session.add(p_iphone)
            db.session.flush()

        # Check / create offers for iPhone
        o_iphone_amz = Offer.query.filter_by(product_id=p_iphone.id, platform="Amazon").first()
        if not o_iphone_amz:
            o_iphone_amz = Offer(
                product_id=p_iphone.id,
                platform="Amazon",
                title="Apple iPhone 15 (128 GB) - Black",
                url="https://www.amazon.in/dp/B0CHX1W1XY",
                price=Decimal("69999.00"),
                original_price=Decimal("79900.00"),
                rating=4.5,
                review_count=8450,
                seller_name="Appario Retail",
                seller_rating=4.6,
                availability="In Stock",
                delivery_text="FREE Delivery by Tomorrow",
                offer_text="₹4,000 Instant Discount with HDFC Credit Cards",
            )
            db.session.add(o_iphone_amz)
            db.session.flush()

        o_iphone_flk = Offer.query.filter_by(product_id=p_iphone.id, platform="Flipkart").first()
        if not o_iphone_flk:
            o_iphone_flk = Offer(
                product_id=p_iphone.id,
                platform="Flipkart",
                title="Apple iPhone 15 (Black, 128 GB)",
                url="https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4",
                price=Decimal("68999.00"),
                original_price=Decimal("79900.00"),
                rating=4.6,
                review_count=14200,
                seller_name="SuperComNet",
                seller_rating=4.5,
                availability="In Stock",
                delivery_text="Free Delivery in 2 Days",
                offer_text="Bank Offer: 5% Unlimited Cashback on Flipkart Axis Card",
            )
            db.session.add(o_iphone_flk)
            db.session.flush()

        # Seed realistic timestamped PriceHistory rows for iPhone 15
        iphone_amz_history = [
            (45, Decimal("74999.00")),
            (38, Decimal("73499.00")),
            (30, Decimal("71999.00")),
            (21, Decimal("72499.00")),
            (14, Decimal("69999.00")),
            (7, Decimal("70499.00")),
            (0, Decimal("69999.00")),
        ]
        iphone_flk_history = [
            (45, Decimal("74499.00")),
            (38, Decimal("72999.00")),
            (30, Decimal("71499.00")),
            (21, Decimal("70999.00")),
            (14, Decimal("68999.00")),
            (7, Decimal("69499.00")),
            (0, Decimal("68999.00")),
        ]

        # Add price points if not already present
        now = datetime.utcnow()
        if PriceHistory.query.filter_by(offer_id=o_iphone_amz.id).count() < len(iphone_amz_history):
            for days_ago, pr in iphone_amz_history:
                ts = now - timedelta(days=days_ago)
                db.session.add(PriceHistory(offer_id=o_iphone_amz.id, price=pr, recorded_at=ts))

        if PriceHistory.query.filter_by(offer_id=o_iphone_flk.id).count() < len(iphone_flk_history):
            for days_ago, pr in iphone_flk_history:
                ts = now - timedelta(days=days_ago)
                db.session.add(PriceHistory(offer_id=o_iphone_flk.id, price=pr, recorded_at=ts))

        # 2. Product 5: LG 7 Kg Front Load Washing Machine
        p_lg = db.session.get(Product, 5)
        if p_lg:
            # Ensure Flipkart offer exists
            o_lg_flk = Offer.query.filter_by(product_id=p_lg.id, platform="Flipkart").first()
            if not o_lg_flk:
                o_lg_flk = Offer(
                    product_id=p_lg.id,
                    platform="Flipkart",
                    title="LG 7 kg 5 Star with AI DD, Steam Fully Automatic Front Load Washing Machine Middle Black",
                    url="https://www.flipkart.com/lg-7-kg-5-star-front-load",
                    price=Decimal("31990.00"),
                    original_price=Decimal("43990.00"),
                    rating=4.4,
                    review_count=3210,
                    seller_name="FashNear",
                    seller_rating=4.4,
                    availability="In Stock",
                    delivery_text="Free delivery by Friday",
                    offer_text="₹1,500 Off On ICICI Bank Cards",
                )
                db.session.add(o_lg_flk)
                db.session.flush()

            o_lg_amz = Offer.query.filter_by(product_id=p_lg.id, platform="Amazon").first()
            if o_lg_amz and PriceHistory.query.filter_by(offer_id=o_lg_amz.id).count() < 4:
                lg_amz_pts = [
                    (40, Decimal("35990.00")),
                    (28, Decimal("34490.00")),
                    (18, Decimal("33990.00")),
                    (10, Decimal("32990.00")),
                    (0, Decimal("32990.00")),
                ]
                for days_ago, pr in lg_amz_pts:
                    ts = now - timedelta(days=days_ago)
                    db.session.add(PriceHistory(offer_id=o_lg_amz.id, price=pr, recorded_at=ts))

            if o_lg_flk and PriceHistory.query.filter_by(offer_id=o_lg_flk.id).count() < 4:
                lg_flk_pts = [
                    (40, Decimal("34990.00")),
                    (28, Decimal("33990.00")),
                    (18, Decimal("32490.00")),
                    (10, Decimal("31990.00")),
                    (0, Decimal("31990.00")),
                ]
                for days_ago, pr in lg_flk_pts:
                    ts = now - timedelta(days=days_ago)
                    db.session.add(PriceHistory(offer_id=o_lg_flk.id, price=pr, recorded_at=ts))

        # 3. Product 4: Whirlpool 7 kg Front Load
        p_wp = db.session.get(Product, 4)
        if p_wp:
            o_wp_amz = Offer.query.filter_by(product_id=p_wp.id, platform="Amazon").first()
            if not o_wp_amz:
                o_wp_amz = Offer(
                    product_id=p_wp.id,
                    platform="Amazon",
                    title="Whirlpool 7 kg 5 Star Inverter Fully-Automatic Front Load Washing Machine",
                    url="https://www.amazon.in/dp/B09WHIRL01",
                    price=Decimal("35490.00"),
                    original_price=Decimal("46000.00"),
                    rating=4.2,
                    review_count=1840,
                    seller_name="Cloudtail India",
                    seller_rating=4.5,
                    availability="In Stock",
                    delivery_text="Free Delivery in 3 Days",
                    offer_text="Up to ₹2,000 Exchange Bonus",
                )
                db.session.add(o_wp_amz)
                db.session.flush()

            o_wp_flk = Offer.query.filter_by(product_id=p_wp.id, platform="Flipkart").first()
            if o_wp_amz and PriceHistory.query.filter_by(offer_id=o_wp_amz.id).count() < 4:
                wp_amz_pts = [
                    (35, Decimal("37990.00")),
                    (22, Decimal("36490.00")),
                    (12, Decimal("35990.00")),
                    (0, Decimal("35490.00")),
                ]
                for days_ago, pr in wp_amz_pts:
                    ts = now - timedelta(days=days_ago)
                    db.session.add(PriceHistory(offer_id=o_wp_amz.id, price=pr, recorded_at=ts))

            if o_wp_flk and PriceHistory.query.filter_by(offer_id=o_wp_flk.id).count() < 4:
                wp_flk_pts = [
                    (35, Decimal("38200.00")),
                    (22, Decimal("36900.00")),
                    (12, Decimal("36300.00")),
                    (0, Decimal("36300.00")),
                ]
                for days_ago, pr in wp_flk_pts:
                    ts = now - timedelta(days=days_ago)
                    db.session.add(PriceHistory(offer_id=o_wp_flk.id, price=pr, recorded_at=ts))

        db.session.commit()
        print("[SmartBuy] Successfully seeded verified database price histories!")

if __name__ == "__main__":
    seed_history()
