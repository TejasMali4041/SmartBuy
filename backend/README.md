# SmartBuy Backend

Flask + MySQL backend for the SmartBuy product price comparison and decision support system.

## Features

- User registration and password hashing
- JWT login/authentication
- Product database
- Product search and normalization
- Multiple offers per product
- Price history
- Price comparison
- Recommendation score
- User watchlist
- Target price storage
- Search history
- Health/database test endpoints

## 1. Create database

In MySQL:

```sql
CREATE DATABASE smartbuy;
```

## 2. Install

Activate the virtual environment:

```powershell
.\venv\Scripts\activate
```

Install packages:

```powershell
pip install -r requirements.txt
```

## 3. Configure

For the current local setup, edit `app.py` or preferably move the database URL and JWT secret to environment variables.

Never commit a real database password or JWT secret to GitHub.

## 4. Run

```powershell
python app.py
```

Backend:

`http://127.0.0.1:5000`

## Main endpoints

### Public

- GET `/api/health`
- GET `/api/db-test`
- GET `/api/products?q=iphone`
- GET `/api/products/<id>`
- GET `/api/products/<id>/offers`
- GET `/api/compare?q=iphone`
- GET `/api/recommendations?q=iphone`
- GET `/api/offers/<id>/history`

### Authentication

- POST `/api/register`
- POST `/api/login`
- GET `/api/me` (JWT)

### Authenticated

- POST `/api/products`
- POST `/api/products/<id>/offers`
- PUT `/api/offers/<id>`
- GET `/api/watchlist`
- POST `/api/watchlist/<product_id>`
- DELETE `/api/watchlist/<product_id>`

## Important

This backend intentionally does NOT pretend to scrape Amazon/Flipkart/Meesho/Myntra automatically.

The `offers` API is the data-ingestion layer. A separate scraper/API service can collect platform data and send normalized product/offer records to this backend.

For the final SmartBuy project, add platform-specific collectors in a separate service and respect each platform's terms, robots rules, rate limits and API requirements.

### Scraping / real product data

- POST `/api/scrape/url` (JWT required)

Send a JSON body such as:

```json
{
  "url": "https://example.com/product-page"
}
```

The collector reads standard Product JSON-LD from a product page, normalizes the result, stores it as a Product/Offer, and records a PriceHistory entry. It does not bypass CAPTCHA, login walls, anti-bot systems, or access controls. Platform-specific search collectors can be added later without changing the database or comparison/recommendation layers.

### Scraping / real product data

- POST `/api/scrape/url` (JWT required)

Send a JSON body such as:

```json
{
  "url": "https://example.com/product-page"
}
```

The collector reads standard Product JSON-LD from a product page, normalizes the result, stores it as a Product/Offer, and records a PriceHistory entry. It does not bypass CAPTCHA, login walls, anti-bot systems, or access controls. Platform-specific search collectors can be added later without changing the database or comparison/recommendation layers.
