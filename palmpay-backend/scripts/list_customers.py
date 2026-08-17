"""
Script to list all registered customers in the local SQLite database.

Displays customer ID, name, email, contact, mandate token status, and
the number of palm embeddings enrolled, allowing easy inspection and
cleanup of duplicate or orphaned customer records.

Usage:
    python scripts/list_customers.py
"""

import os
import sys

# Ensure backend modules can be imported if script is run directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import SessionLocal
from backend.models import Customer


def list_customers():
    db = SessionLocal()
    try:
        customers = db.query(Customer).order_by(Customer.id).all()
        if not customers:
            print("No customers found in database.")
            return

        print(f"Total enrolled customers: {len(customers)}\n")
        header = f"{'ID':<5} | {'Name':<20} | {'Contact':<15} | {'Email':<25} | {'Consent Date':<20} | {'Consent Ver':<12} | {'Mandate Token':<18} | {'Embeddings':<10}"
        divider = "-" * len(header)
        print(header)
        print(divider)

        for c in customers:
            token_status = c.mandate_token_id if c.mandate_token_id else "PENDING"
            emb_count = len(c.embeddings)
            email_str = c.email or "N/A"
            consent_date_str = c.consent_given_at.strftime("%Y-%m-%d %H:%M") if c.consent_given_at else "N/A"
            consent_ver_str = c.consent_version or "v1.0"
            print(f"{c.id:<5} | {c.name:<20} | {c.contact:<15} | {email_str:<25} | {consent_date_str:<20} | {consent_ver_str:<12} | {token_status:<18} | {emb_count:<10}")

        print(divider)
    finally:
        db.close()


if __name__ == "__main__":
    list_customers()
