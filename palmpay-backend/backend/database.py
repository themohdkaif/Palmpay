import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./palmpay.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_migrations():
    """Auto-migrate SQLite database columns if missing."""
    try:
        conn = sqlite3.connect("palmpay.db")
        cur = conn.cursor()
        cols = [row[1] for row in cur.execute("PRAGMA table_info(customers)").fetchall()]
        if cols and "step_up_pin" not in cols:
            cur.execute("ALTER TABLE customers ADD COLUMN step_up_pin TEXT;")
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB MIGRATION WARNING] {e}")


ensure_schema_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
