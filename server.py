from flask import Flask, request, send_file, send_from_directory, jsonify, make_response, redirect, g
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash
import os
import shutil
import sqlite3
import uuid
import secrets
import time
import socket
import struct
import logging
import queue
import threading
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
import cv2, numpy as np, io

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None

try:
    import boto3
except ImportError:
    boto3 = None

def load_local_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_local_env()

app = Flask(__name__)
app.logger.setLevel(logging.INFO)
MAX_ORDER_FILES = 10
MAX_ORDER_TOTAL_BYTES = 100 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_ORDER_TOTAL_BYTES + (1 * 1024 * 1024)
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
ORDER_FILE_BYTES = 20 * 1024 * 1024
ORDER_EXTENSIONS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "zip"}
BASE_DIR = os.path.dirname(__file__)
configured_data_dir = os.environ.get("TONIE_UPLOAD_DIR", "./data")
DATA_DIR = configured_data_dir if os.path.isabs(configured_data_dir) else os.path.abspath(os.path.join(BASE_DIR, configured_data_dir))
ORDER_UPLOAD_DIR = os.path.join(DATA_DIR, "order-files")
DELIVERY_UPLOAD_DIR = os.path.join(DATA_DIR, "delivery-files")
configured_db_path = os.environ.get("TONIE_DB_PATH", os.path.join(DATA_DIR, "tonie_hub.db"))
ORDER_DB = configured_db_path if os.path.isabs(configured_db_path) else os.path.abspath(os.path.join(BASE_DIR, configured_db_path))
MYSQL_CONFIG = {
    "host": os.environ.get("ALWAYSDATA_DB_HOST", ""),
    "user": os.environ.get("ALWAYSDATA_DB_USER", ""),
    "password": os.environ.get("ALWAYSDATA_DB_PASSWORD", ""),
    "database": os.environ.get("ALWAYSDATA_DB_NAME", ""),
    "port": int(os.environ.get("ALWAYSDATA_DB_PORT", "3306")),
}
MYSQL_CONFIGURED = pymysql and all(MYSQL_CONFIG[key] for key in ("host", "user", "password", "database"))
DB_BACKEND = "mysql" if MYSQL_CONFIGURED else "sqlite"
ADMIN_PASSWORD = os.environ.get("TONIE_ADMIN_PASSWORD", "change-me")
ADMIN_TOKENS = {}
ADMIN_TOKEN_TTL = int(os.environ.get("TONIE_ADMIN_TOKEN_TTL", "28800"))
LOGIN_ATTEMPTS = {}
LOGIN_WINDOW_SECONDS = 300
LOGIN_MAX_ATTEMPTS = 8
ORDER_ATTEMPTS = {}
ORDER_WINDOW_SECONDS = 300
ORDER_MAX_ATTEMPTS = 5
OBJECT_STORAGE_BUCKET = os.environ.get("OBJECT_STORAGE_BUCKET", "")
OBJECT_STORAGE_REGION = os.environ.get("OBJECT_STORAGE_REGION", "us-east-1")
OBJECT_STORAGE_ENDPOINT = os.environ.get("OBJECT_STORAGE_ENDPOINT_URL", "")
OBJECT_STORAGE_ACCESS_KEY = os.environ.get("OBJECT_STORAGE_ACCESS_KEY", "")
OBJECT_STORAGE_SECRET_KEY = os.environ.get("OBJECT_STORAGE_SECRET_KEY", "")
OBJECT_STORAGE_ENABLED = bool(boto3 and OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_ACCESS_KEY and OBJECT_STORAGE_SECRET_KEY)
OBJECT_STORAGE_CLIENT = boto3.client("s3", region_name=OBJECT_STORAGE_REGION, endpoint_url=OBJECT_STORAGE_ENDPOINT or None, aws_access_key_id=OBJECT_STORAGE_ACCESS_KEY, aws_secret_access_key=OBJECT_STORAGE_SECRET_KEY) if OBJECT_STORAGE_ENABLED else None
CLAMAV_HOST = os.environ.get("TONIE_CLAMAV_HOST", "")
CLAMAV_PORT = int(os.environ.get("TONIE_CLAMAV_PORT", "3310"))
REQUIRE_MALWARE_SCAN = os.environ.get("TONIE_REQUIRE_MALWARE_SCAN", "1" if os.environ.get("TONIE_ENV") == "production" else "0") == "1"

if os.environ.get("TONIE_ENV") == "production":
    if ADMIN_PASSWORD == "change-me" and not os.environ.get("TONIE_ADMIN_PASSWORD_HASH"):
        raise RuntimeError("Configure TONIE_ADMIN_PASSWORD_HASH before starting in production.")
    if os.environ.get("TONIE_REQUIRE_OBJECT_STORAGE", "1") == "1" and not OBJECT_STORAGE_ENABLED:
        raise RuntimeError("Configure object storage before starting in production.")
    if REQUIRE_MALWARE_SCAN and not CLAMAV_HOST:
        raise RuntimeError("Configure TONIE_CLAMAV_HOST before starting in production.")

os.makedirs(ORDER_UPLOAD_DIR, exist_ok=True)
os.makedirs(DELIVERY_UPLOAD_DIR, exist_ok=True)
MYSQL_POOL_SIZE = max(2, int(os.environ.get("TONIE_MYSQL_POOL_SIZE", "5")))
MYSQL_POOL = queue.LifoQueue(maxsize=MYSQL_POOL_SIZE)
MYSQL_POOL_CREATED = 0
MYSQL_POOL_LOCK = threading.Lock()
PUBLIC_SETTINGS_CACHE = None
PUBLIC_SETTINGS_CACHE_AT = 0
PUBLIC_SETTINGS_CACHE_TTL = 300

def storage_key(kind, reference, stored_name):
    return f"{kind}/{reference}/{stored_name}"

def store_bytes(raw, key, content_type, local_path):
    if OBJECT_STORAGE_ENABLED:
        OBJECT_STORAGE_CLIENT.put_object(Bucket=OBJECT_STORAGE_BUCKET, Key=key, Body=raw, ContentType=content_type or "application/octet-stream")
        return
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as target:
        target.write(raw)

def remove_storage_prefix(reference):
    if OBJECT_STORAGE_ENABLED:
        for kind in ("orders", "deliverables"):
            listed = OBJECT_STORAGE_CLIENT.list_objects_v2(Bucket=OBJECT_STORAGE_BUCKET, Prefix=f"{kind}/{reference}/")
            keys = [{"Key": item["Key"]} for item in listed.get("Contents", [])]
            if keys:
                OBJECT_STORAGE_CLIENT.delete_objects(Bucket=OBJECT_STORAGE_BUCKET, Delete={"Objects": keys})
    else:
        for root in (os.path.join(ORDER_UPLOAD_DIR, reference), os.path.join(DELIVERY_UPLOAD_DIR, reference)):
            if os.path.isdir(root):
                shutil.rmtree(root)

def download_response(kind, reference, stored_name, original_name, content_type=None):
    if OBJECT_STORAGE_ENABLED:
        url = OBJECT_STORAGE_CLIENT.generate_presigned_url("get_object", Params={"Bucket": OBJECT_STORAGE_BUCKET, "Key": storage_key(kind, reference, stored_name), "ResponseContentDisposition": f'attachment; filename="{original_name}"'}, ExpiresIn=300)
        return redirect(url)
    local_kind = "order-files" if kind == "orders" else "delivery-files"
    root = os.path.abspath(os.path.join(DATA_DIR, local_kind, reference))
    path = os.path.abspath(os.path.join(root, stored_name))
    if not path.startswith(root + os.sep) or not os.path.exists(path):
        return jsonify({"error": "File not found."}), 404
    return send_file(path, as_attachment=True, download_name=original_name, mimetype=content_type)

def malware_scan(raw, filename):
    """Scan bytes with ClamAV using its INSTREAM protocol.

    A missing scanner is tolerated in local development but is a hard failure
    when TONIE_REQUIRE_MALWARE_SCAN=1.
    """
    if not CLAMAV_HOST:
        if REQUIRE_MALWARE_SCAN:
            raise RuntimeError("Malware scanner is not configured.")
        return
    try:
        with socket.create_connection((CLAMAV_HOST, CLAMAV_PORT), timeout=10) as connection:
            connection.sendall(b"zINSTREAM\\0")
            for offset in range(0, len(raw), 1024 * 1024):
                chunk = raw[offset:offset + 1024 * 1024]
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))
            result = connection.recv(4096).decode("utf-8", errors="replace").strip()
        if not result.endswith("OK"):
            raise ValueError(f"Malware detected in {filename}.")
    except ValueError:
        raise
    except Exception as error:
        if REQUIRE_MALWARE_SCAN:
            raise RuntimeError(f"Malware scanner unavailable: {error}") from error
        app.logger.warning("Malware scan skipped for %s: %s", filename, error)

def scan_or_reject(raw, filename):
    try:
        malware_scan(raw, filename)
    except ValueError as error:
        raise PermissionError(str(error)) from error

class MySQLConnection:
    is_mysql = True
    def __init__(self):
        global MYSQL_POOL_CREATED
        try:
            connection = MYSQL_POOL.get_nowait()
        except queue.Empty:
            with MYSQL_POOL_LOCK:
                if MYSQL_POOL_CREATED < MYSQL_POOL_SIZE:
                    connection = pymysql.connect(**MYSQL_CONFIG, cursorclass=DictCursor, autocommit=False)
                    MYSQL_POOL_CREATED += 1
                else:
                    connection = MYSQL_POOL.get(timeout=15)
        connection.ping(reconnect=True)
        self.connection = connection
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type:
            self.connection.rollback()
        else:
            self.connection.commit()
        try:
            MYSQL_POOL.put_nowait(self.connection)
        except queue.Full:
            self.connection.close()
    def execute(self, query, params=()):
        query = query.replace("?", "%s").replace("INSERT OR IGNORE", "INSERT IGNORE")
        cursor = self.connection.cursor()
        cursor.execute(query, params)
        return cursor
    def executemany(self, query, params):
        query = query.replace("?", "%s").replace("INSERT OR IGNORE", "INSERT IGNORE")
        cursor = self.connection.cursor()
        cursor.executemany(query, params)
        return cursor
    def executescript(self, script):
        for statement in script.split(";"):
            statement = statement.strip().replace("AUTOINCREMENT", "AUTO_INCREMENT")
            if statement:
                self.execute(statement)

def db_connection():
    global DB_BACKEND
    if DB_BACKEND == "mysql":
        try:
            return MySQLConnection()
        except Exception as error:
            require_mysql = os.environ.get("TONIE_REQUIRE_MYSQL", "1" if os.environ.get("TONIE_ENV") == "production" else "0") == "1"
            if require_mysql:
                raise
            print(f"MySQL unavailable ({error}); using local SQLite fallback.")
            DB_BACKEND = "sqlite"
    connection = sqlite3.connect(ORDER_DB)
    connection.row_factory = sqlite3.Row
    return connection

def init_order_db():
    with db_connection() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference VARCHAR(64) NOT NULL UNIQUE,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                service TEXT NOT NULL,
                instructions TEXT NOT NULL,
                deadline TEXT NOT NULL,
                delivery_method VARCHAR(32) NOT NULL DEFAULT 'Portal',
                status TEXT NOT NULL DEFAULT 'New Request',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS order_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            );
            CREATE TABLE IF NOT EXISTS quotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                base_price REAL NOT NULL,
                discount REAL NOT NULL DEFAULT 0,
                additional_fees REAL NOT NULL DEFAULT 0,
                express_fee REAL NOT NULL DEFAULT 0,
                final_amount REAL NOT NULL,
                payment_terms TEXT NOT NULL,
                completion_time TEXT NOT NULL,
                expiry_date TEXT NOT NULL,
                description TEXT NOT NULL,
                revision_policy TEXT,
                decision TEXT,
                decided_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            );
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                method TEXT NOT NULL DEFAULT 'M-Pesa manual',
                reference TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending Verification',
                notes TEXT,
                submitted_at TEXT NOT NULL,
                confirmed_at TEXT,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            );
            CREATE TABLE IF NOT EXISTS delivery_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            );
            CREATE TABLE IF NOT EXISTS business_settings (
                `key` VARCHAR(64) PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS mpesa_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_text TEXT NOT NULL,
                received_at TEXT NOT NULL
            );
        """)
        defaults = {
            "business_name": "TYPEARENA HUB",
            "tagline": "Your Cyber. Online.",
            "whatsapp": "254762220299",
            "email": "",
            "phone": "",
            "paybill": "",
            "till_number": "",
            "payment_instructions": "",
            "operating_hours": "Online every day",
            "testimonials": "",
        }
        connection.executemany("INSERT OR IGNORE INTO business_settings (`key`, value) VALUES (?, ?)", defaults.items())
    try:
        with db_connection() as connection:
            connection.execute("ALTER TABLE orders ADD COLUMN delivery_method VARCHAR(32) NOT NULL DEFAULT 'Portal'")
    except Exception:
        pass
    with db_connection() as connection:
        connection.execute("UPDATE orders SET delivery_method = 'Portal' WHERE delivery_method = 'Download'")

init_order_db()

@app.before_request
def start_request_metrics():
    g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    g.request_started_at = time.perf_counter()

@app.after_request
def add_dev_headers(response):
    allowed_origin = os.environ.get("TONIE_ALLOWED_ORIGIN", "*")
    response.headers["Access-Control-Allow-Origin"] = allowed_origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Request-ID"] = getattr(g, "request_id", "")
    elapsed_ms = (time.perf_counter() - getattr(g, "request_started_at", time.perf_counter())) * 1000
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.1f}"
    if elapsed_ms >= 1000 or response.status_code >= 500:
        app.logger.warning("request_id=%s method=%s path=%s status=%s duration_ms=%.1f", getattr(g, "request_id", "-"), request.method, request.path, response.status_code, elapsed_ms)
    return response

@app.errorhandler(RequestEntityTooLarge)
def request_too_large(error):
    return jsonify({"error": "The upload is too large. Use up to 10 files and 100MB combined."}), 413

@app.route("/api/health", methods=["GET"])
def health():
    try:
        with db_connection() as connection:
            connection.execute("SELECT 1").fetchone()
        return jsonify({"ok": True, "service": "typearena-hub", "mode": f"{DB_BACKEND}-orders-and-opencv", "database": DB_BACKEND, "storage": "object" if OBJECT_STORAGE_ENABLED else "local", "malwareScanning": bool(CLAMAV_HOST)})
    except Exception as error:
        app.logger.exception("health check failed")
        return jsonify({"ok": False, "service": "typearena-hub", "error": str(error)}), 503

def admin_token():
    header = request.headers.get("Authorization", "")
    return header.removeprefix("Bearer ").strip() if header.startswith("Bearer ") else ""

def require_admin():
    token = admin_token()
    expires_at = ADMIN_TOKENS.get(token)
    if not expires_at or expires_at <= time.time():
        ADMIN_TOKENS.pop(token, None)
        return jsonify({"error": "Administrator authentication required."}), 401
    return None

def normalize_kenyan_phone(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    if digits.startswith("254") and len(digits) == 12 and digits[3] in "701":
        return digits
    if digits.startswith("0") and len(digits) == 10 and digits[:2] in {"07", "01"}:
        return "254" + digits[1:]
    raise ValueError("Enter a valid Kenyan phone number, for example 0712 345 678 or +254 712 345 678.")

PUBLIC_SETTING_KEYS = {"business_name", "tagline", "whatsapp", "email", "phone", "operating_hours", "testimonials"}
EDITABLE_SETTING_KEYS = PUBLIC_SETTING_KEYS | {"paybill", "till_number", "payment_instructions"}

@app.route("/api/settings", methods=["GET"])
def public_settings():
    global PUBLIC_SETTINGS_CACHE, PUBLIC_SETTINGS_CACHE_AT
    now = time.time()
    if PUBLIC_SETTINGS_CACHE is not None and now - PUBLIC_SETTINGS_CACHE_AT < PUBLIC_SETTINGS_CACHE_TTL:
        response = jsonify(PUBLIC_SETTINGS_CACHE)
        response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
        return response
    with db_connection() as connection:
        rows = connection.execute("SELECT `key`, value FROM business_settings WHERE `key` IN ({})".format(",".join("?" for _ in PUBLIC_SETTING_KEYS)), tuple(PUBLIC_SETTING_KEYS)).fetchall()
    PUBLIC_SETTINGS_CACHE = {row["key"]: row["value"] for row in rows}
    PUBLIC_SETTINGS_CACHE_AT = now
    response = jsonify(PUBLIC_SETTINGS_CACHE)
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return response

@app.route("/api/admin/settings", methods=["GET", "PATCH"])
def admin_settings():
    denied = require_admin()
    if denied:
        return denied
    with db_connection() as connection:
        if request.method == "PATCH":
            payload = request.get_json(silent=True) or {}
            updates = [(key, str(value).strip()) for key, value in payload.items() if key in EDITABLE_SETTING_KEYS]
            if DB_BACKEND == "mysql":
                connection.executemany("INSERT INTO business_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", updates)
            else:
                connection.executemany("INSERT INTO business_settings (`key`, value) VALUES (?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value", updates)
            global PUBLIC_SETTINGS_CACHE, PUBLIC_SETTINGS_CACHE_AT
            PUBLIC_SETTINGS_CACHE = None
            PUBLIC_SETTINGS_CACHE_AT = 0
        rows = connection.execute("SELECT `key`, value FROM business_settings ORDER BY `key`").fetchall()
    return jsonify({row["key"]: row["value"] for row in rows})

@app.route("/api/admin/login", methods=["OPTIONS", "POST"])
def admin_login():
    if request.method == "OPTIONS":
        return make_response("", 204)
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password", "") or request.form.get("password", ""))
    client_key = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    now = time.time()
    attempts = [stamp for stamp in LOGIN_ATTEMPTS.get(client_key, []) if now - stamp < LOGIN_WINDOW_SECONDS]
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        return jsonify({"error": "Too many sign-in attempts. Please try again later."}), 429
    configured_hash = os.environ.get("TONIE_ADMIN_PASSWORD_HASH", "")
    valid = check_password_hash(configured_hash, password) if configured_hash else secrets.compare_digest(password, ADMIN_PASSWORD)
    if not valid:
        LOGIN_ATTEMPTS[client_key] = attempts + [now]
        return jsonify({"error": "Incorrect administrator password."}), 401
    LOGIN_ATTEMPTS.pop(client_key, None)
    token = secrets.token_urlsafe(32)
    ADMIN_TOKENS[token] = now + ADMIN_TOKEN_TTL
    return jsonify({"token": token, "expiresIn": ADMIN_TOKEN_TTL, "message": "Signed in successfully."})

@app.route("/api/admin/orders", methods=["OPTIONS", "GET"])
def admin_orders():
    if request.method == "OPTIONS":
        return make_response("", 204)
    denied = require_admin()
    if denied:
        return denied
    with db_connection() as connection:
        orders = connection.execute("""
            SELECT o.*, COUNT(f.id) AS file_count
            FROM orders o LEFT JOIN order_files f ON f.order_id = o.id
            GROUP BY o.id ORDER BY o.created_at DESC
        """).fetchall()
    result = []
    with db_connection() as connection:
        for order in orders:
            item = dict(order)
            quote = connection.execute("SELECT * FROM quotations WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order["id"],)).fetchone()
            item["quotation"] = dict(quote) if quote else None
            payment = connection.execute("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order["id"],)).fetchone()
            item["payment"] = dict(payment) if payment else None
            files = connection.execute("SELECT original_name, stored_name, content_type, size_bytes FROM order_files WHERE order_id = ? ORDER BY id ASC", (order["id"],)).fetchall()
            item["files"] = [dict(file) for file in files]
            result.append(item)
    return jsonify(result)

@app.route("/api/admin/orders/<reference>/files/<stored_name>", methods=["GET"])
def download_admin_order_file(reference, stored_name):
    denied = require_admin()
    if denied:
        return denied
    with db_connection() as connection:
        file_row = connection.execute("""
            SELECT f.original_name, f.stored_name FROM order_files f
            JOIN orders o ON o.id = f.order_id
            WHERE o.reference = ? AND f.stored_name = ?
        """, (reference, stored_name)).fetchone()
    if not file_row:
        return jsonify({"error": "File not found."}), 404
    order_root = os.path.abspath(os.path.join(ORDER_UPLOAD_DIR, reference))
    return download_response("orders", reference, file_row["stored_name"], file_row["original_name"])

def money_value(payload, key):
    try:
        value = Decimal(str(payload.get(key, 0)))
        if value < 0 or value > Decimal("100000000"):
            raise InvalidOperation
        return value.quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{key.replace('_', ' ').capitalize()} must be a valid non-negative amount.")

@app.route("/api/admin/orders/<reference>/quotation", methods=["OPTIONS", "POST"])
def create_quotation(reference):
    if request.method == "OPTIONS":
        return make_response("", 204)
    denied = require_admin()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    required = ["payment_terms", "completion_time", "expiry_date", "description"]
    if any(not str(payload.get(key, "")).strip() for key in required):
        return jsonify({"error": "Payment terms, completion time, expiry date and work description are required."}), 400
    try:
        base_price = money_value(payload, "base_price")
        discount = money_value(payload, "discount")
        additional_fees = money_value(payload, "additional_fees")
        express_fee = money_value(payload, "express_fee")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    final_amount = max(Decimal("0.00"), base_price + additional_fees + express_fee - discount)
    with db_connection() as connection:
        order = connection.execute("SELECT id FROM orders WHERE reference = ?", (reference,)).fetchone()
        if not order:
            return jsonify({"error": "Order not found."}), 404
        created_at = datetime.now(timezone.utc).isoformat()
        connection.execute("""
            INSERT INTO quotations (order_id, base_price, discount, additional_fees, express_fee, final_amount, payment_terms, completion_time, expiry_date, description, revision_policy, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (order["id"], float(base_price), float(discount), float(additional_fees), float(express_fee), float(final_amount), str(payload["payment_terms"]).strip(), str(payload["completion_time"]).strip(), str(payload["expiry_date"]).strip(), str(payload["description"]).strip(), str(payload.get("revision_policy", "")).strip(), created_at))
        connection.execute("UPDATE orders SET status = 'Quotation Sent' WHERE id = ?", (order["id"],))
        quote = connection.execute("SELECT * FROM quotations WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order["id"],)).fetchone()
    return jsonify(dict(quote)), 201

@app.route("/api/orders/<reference>/quotation", methods=["GET"])
def get_customer_quotation(reference):
    phone = (request.args.get("phone") or "").strip()
    with db_connection() as connection:
        quote = connection.execute("""
            SELECT q.*, o.reference, o.name, o.phone, o.service, o.status,
                   p.status AS payment_status
            FROM quotations q JOIN orders o ON o.id = q.order_id
            LEFT JOIN payments p ON p.id = (
                SELECT p2.id FROM payments p2
                WHERE p2.order_id = o.id ORDER BY p2.id DESC LIMIT 1
            )
            WHERE o.reference = ? AND o.phone = ? ORDER BY q.id DESC LIMIT 1
        """, (reference, phone)).fetchone()
    if not quote:
        return jsonify({"error": "Quotation not found for those details."}), 404
    result = dict(quote)
    result["paymentStatus"] = result.pop("payment_status", None)
    with db_connection() as connection:
        setting_rows = connection.execute("SELECT `key`, value FROM business_settings WHERE `key` IN (?, ?, ?)", ("paybill", "till_number", "payment_instructions")).fetchall()
    settings = {row["key"]: row["value"] for row in setting_rows}
    result["paybill"] = settings.get("paybill", "")
    result["tillNumber"] = settings.get("till_number", "")
    result["paymentInstructions"] = settings.get("payment_instructions", "")
    return jsonify(result)

@app.route("/api/orders/<reference>/tracking", methods=["GET"])
def track_customer_order(reference):
    phone = (request.args.get("phone") or "").strip()
    with db_connection() as connection:
        order = connection.execute("SELECT reference, name, service, deadline, delivery_method, status, created_at FROM orders WHERE reference = ? AND phone = ?", (reference, phone)).fetchone()
    if not order:
        return jsonify({"error": "Order not found for those details."}), 404
    milestones = [
        ("Request submitted", "New Request"),
        ("Request reviewed", "Under Review"),
        ("Quotation issued", "Quotation Sent"),
        ("Quotation accepted", "Quotation Accepted"),
        ("Payment confirmed", "Payment Confirmed"),
        ("Work in progress", "In Progress"),
        ("Work completed", "Completed"),
        ("Files delivered", "Delivered"),
    ]
    status_index = {status: index for index, (_, status) in enumerate(milestones)}
    current_index = status_index.get(order["status"], 0)
    return jsonify({"reference": order["reference"], "name": order["name"], "service": order["service"], "deadline": order["deadline"], "deliveryMethod": order["delivery_method"], "status": order["status"], "createdAt": order["created_at"], "milestones": [{"label": label, "complete": index <= current_index, "current": index == current_index} for index, (label, _) in enumerate(milestones)]})

def safe_order(order_reference, phone=None):
    with db_connection() as connection:
        query = "SELECT id, reference, status FROM orders WHERE reference = ?"
        params = [order_reference]
        if phone is not None:
            query += " AND phone = ?"
            params.append(phone)
        return connection.execute(query, params).fetchone()

@app.route("/api/orders/<reference>/deliverables", methods=["GET"])
def list_customer_deliverables(reference):
    phone = (request.args.get("phone") or "").strip()
    order = safe_order(reference, phone)
    if not order:
        return jsonify({"error": "Order not found for those details."}), 404
    if order["status"] not in {"Completed", "Delivered"}:
        return jsonify({"error": "Deliverables are not available yet."}), 409
    with db_connection() as connection:
        files = connection.execute("SELECT original_name, stored_name, content_type, size_bytes, created_at FROM delivery_files WHERE order_id = ? ORDER BY id DESC", (order["id"],)).fetchall()
    return jsonify([dict(file) for file in files])

@app.route("/api/orders/<reference>/deliverables/<stored_name>", methods=["GET"])
def download_customer_deliverable(reference, stored_name):
    phone = (request.args.get("phone") or "").strip()
    order = safe_order(reference, phone)
    if not order or order["status"] not in {"Completed", "Delivered"}:
        return jsonify({"error": "This file is not available."}), 404
    with db_connection() as connection:
        file_row = connection.execute("SELECT original_name, stored_name FROM delivery_files WHERE order_id = ? AND stored_name = ?", (order["id"], stored_name)).fetchone()
    if not file_row:
        return jsonify({"error": "File not found."}), 404
    return download_response("deliverables", reference, file_row["stored_name"], file_row["original_name"])

@app.route("/api/admin/orders/<reference>/deliverables", methods=["POST"])
def upload_admin_deliverables(reference):
    denied = require_admin()
    if denied:
        return denied
    order = safe_order(reference)
    if not order:
        return jsonify({"error": "Order not found."}), 404
    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        return jsonify({"error": "Attach at least one deliverable."}), 400
    if len(uploaded_files) > MAX_ORDER_FILES:
        return jsonify({"error": f"Attach no more than {MAX_ORDER_FILES} files at once."}), 413
    saved = []
    order_dir = os.path.join(DELIVERY_UPLOAD_DIR, reference)
    checked_files = []
    total_bytes = 0
    for uploaded in uploaded_files:
        original_name = secure_filename(uploaded.filename or "")
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if not original_name or extension not in ORDER_EXTENSIONS:
            return jsonify({"error": f"{uploaded.filename} is not an accepted file type."}), 415
        raw = uploaded.read(ORDER_FILE_BYTES + 1)
        if len(raw) > ORDER_FILE_BYTES:
            return jsonify({"error": f"{original_name} must be 20MB or smaller."}), 413
        total_bytes += len(raw)
        if total_bytes > MAX_ORDER_TOTAL_BYTES:
            return jsonify({"error": "The combined upload must be 100MB or smaller."}), 413
        try:
            scan_or_reject(raw, original_name)
        except PermissionError as error:
            return jsonify({"error": str(error)}), 422
        except RuntimeError as error:
            app.logger.error("Required malware scan failed: %s", error)
            return jsonify({"error": "Uploads are temporarily unavailable. Please try again later."}), 503
        checked_files.append((uploaded, original_name, raw))
    os.makedirs(order_dir, exist_ok=True)
    with db_connection() as connection:
        for uploaded, original_name, raw in checked_files:
            stored_name = f"{uuid.uuid4().hex}_{original_name}"
            store_bytes(raw, storage_key("deliverables", reference, stored_name), uploaded.content_type, os.path.join(order_dir, stored_name))
            created_at = datetime.now(timezone.utc).isoformat()
            connection.execute("INSERT INTO delivery_files (order_id, original_name, stored_name, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)", (order["id"], original_name, stored_name, uploaded.content_type, len(raw), created_at))
            saved.append({"original_name": original_name, "stored_name": stored_name, "size_bytes": len(raw)})
        connection.execute("UPDATE orders SET status = 'Completed' WHERE id = ?", (order["id"],))
    return jsonify({"reference": reference, "status": "Completed", "files": saved}), 201

@app.route("/api/orders/<reference>/quotation/decision", methods=["OPTIONS", "POST"])
def decide_customer_quotation(reference):
    if request.method == "OPTIONS":
        return make_response("", 204)
    payload = request.get_json(silent=True) or {}
    phone = (payload.get("phone") or "").strip()
    decision = (payload.get("decision") or "").strip().lower()
    if decision not in {"accepted", "declined"}:
        return jsonify({"error": "Decision must be accepted or declined."}), 400
    with db_connection() as connection:
        quote = connection.execute("""
            SELECT q.id, o.id AS order_id FROM quotations q JOIN orders o ON o.id = q.order_id
            WHERE o.reference = ? AND o.phone = ? ORDER BY q.id DESC LIMIT 1
        """, (reference, phone)).fetchone()
        if not quote:
            return jsonify({"error": "Quotation not found for those details."}), 404
        status = "Quotation Accepted" if decision == "accepted" else "Rejected"
        now = datetime.now(timezone.utc).isoformat()
        connection.execute("UPDATE quotations SET decision = ?, decided_at = ? WHERE id = ?", (decision, now, quote["id"]))
        connection.execute("UPDATE orders SET status = ? WHERE id = ?", (status, quote["order_id"]))
    return jsonify({"reference": reference, "decision": decision, "status": status})

@app.route("/api/orders/<reference>/payment", methods=["OPTIONS", "POST"])
def submit_customer_payment(reference):
    if request.method == "OPTIONS":
        return make_response("", 204)
    payload = request.get_json(silent=True) or {}
    phone = (payload.get("phone") or "").strip()
    payment_reference = (payload.get("reference") or "").strip()
    if not phone or not payment_reference:
        return jsonify({"error": "Phone number and M-Pesa reference are required."}), 400
    with db_connection() as connection:
        order = connection.execute("SELECT id, phone, status FROM orders WHERE reference = ? AND phone = ?", (reference, phone)).fetchone()
        quote = connection.execute("SELECT final_amount, decision FROM quotations WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order["id"],)).fetchone() if order else None
        if not order or not quote:
            return jsonify({"error": "Order or quotation not found for those details."}), 404
        if quote["decision"] != "accepted":
            return jsonify({"error": "Accept the quotation before submitting payment."}), 409
        existing = connection.execute("SELECT id FROM payments WHERE order_id = ? AND status = 'Pending Verification'", (order["id"],)).fetchone()
        if existing:
            return jsonify({"error": "A payment is already awaiting verification."}), 409
        submitted_at = datetime.now(timezone.utc).isoformat()
        matches = connection.execute("SELECT id, message_text FROM mpesa_messages ORDER BY id ASC").fetchall()
        matched_message = next((message for message in matches if payment_reference.upper() in message["message_text"].upper()), None)
        payment_status = "Confirmed" if matched_message else "Pending Verification"
        order_status = "Payment Confirmed" if matched_message else "Awaiting Payment"
        connection.execute("INSERT INTO payments (order_id, amount, reference, status, submitted_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)", (order["id"], quote["final_amount"], payment_reference, payment_status, submitted_at, submitted_at if matched_message else None))
        connection.execute("UPDATE orders SET status = ? WHERE id = ?", (order_status, order["id"]))
        if matched_message:
            connection.execute("DELETE FROM mpesa_messages WHERE id = ?", (matched_message["id"],))
    return jsonify({"reference": reference, "amount": quote["final_amount"], "paymentReference": payment_reference, "status": payment_status, "autoMatched": bool(matched_message)}), 201

@app.route("/api/admin/mpesa-messages", methods=["OPTIONS", "POST", "GET"])
def admin_mpesa_messages():
    if request.method == "OPTIONS":
        return make_response("", 204)
    denied = require_admin()
    if denied:
        return denied
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        message_text = str(payload.get("message", "")).strip()
        if not message_text:
            return jsonify({"error": "Paste an M-Pesa message first."}), 400
        with db_connection() as connection:
            cursor = connection.execute("INSERT INTO mpesa_messages (message_text, received_at) VALUES (?, ?)", (message_text, datetime.now(timezone.utc).isoformat()))
        return jsonify({"id": cursor.lastrowid, "status": "Stored", "pendingMessages": pending_mpesa_count()}), 201
    return jsonify({"pendingMessages": pending_mpesa_count()})

def pending_mpesa_count():
    with db_connection() as connection:
        return connection.execute("SELECT COUNT(*) AS count FROM mpesa_messages").fetchone()["count"]

@app.route("/api/admin/orders/<reference>/payment", methods=["OPTIONS", "PATCH"])
def update_admin_payment(reference):
    if request.method == "OPTIONS":
        return make_response("", 204)
    denied = require_admin()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip()
    if status not in {"Confirmed", "Rejected"}:
        return jsonify({"error": "Payment status must be Confirmed or Rejected."}), 400
    with db_connection() as connection:
        payment = connection.execute("SELECT p.id, p.order_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.reference = ? ORDER BY p.id DESC LIMIT 1", (reference,)).fetchone()
        if not payment:
            return jsonify({"error": "No payment submission found."}), 404
        now = datetime.now(timezone.utc).isoformat() if status == "Confirmed" else None
        connection.execute("UPDATE payments SET status = ?, confirmed_at = ?, notes = ? WHERE id = ?", (status, now, str(payload.get("notes", "")).strip(), payment["id"]))
        connection.execute("UPDATE orders SET status = ? WHERE id = ?", ("Payment Confirmed" if status == "Confirmed" else "Awaiting Payment", payment["order_id"]))
    return jsonify({"reference": reference, "status": status})

@app.route("/api/admin/orders/<reference>", methods=["OPTIONS", "PATCH", "DELETE"])
def update_admin_order(reference):
    if request.method == "OPTIONS":
        return make_response("", 204)
    denied = require_admin()
    if denied:
        return denied
    if request.method == "DELETE":
        with db_connection() as connection:
            order = connection.execute("SELECT id FROM orders WHERE reference = ?", (reference,)).fetchone()
            if not order:
                return jsonify({"error": "Order not found."}), 404
            for table in ("order_files", "delivery_files", "quotations", "payments"):
                connection.execute(f"DELETE FROM {table} WHERE order_id = ?", (order["id"],))
            connection.execute("DELETE FROM orders WHERE id = ?", (order["id"],))
        for root in (os.path.join(ORDER_UPLOAD_DIR, reference), os.path.join(DELIVERY_UPLOAD_DIR, reference)):
            if os.path.isdir(root):
                shutil.rmtree(root)
        return jsonify({"reference": reference, "deleted": True})
    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip()
    allowed_statuses = {"New Request", "Under Review", "Awaiting Quotation", "Quotation Sent", "Quotation Accepted", "Awaiting Payment", "Payment Confirmed", "In Progress", "Completed", "Delivered", "Cancelled", "Rejected"}
    if status not in allowed_statuses:
        return jsonify({"error": "That order status is not available."}), 400
    with db_connection() as connection:
        cursor = connection.execute("UPDATE orders SET status = ? WHERE reference = ?", (status, reference))
    if cursor.rowcount == 0:
        return jsonify({"error": "Order not found."}), 404
    return jsonify({"reference": reference, "status": status})

@app.route("/api/orders", methods=["OPTIONS", "POST"])
def create_order():
    if request.method == "OPTIONS":
        return make_response("", 204)
    client_key = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    now = time.time()
    attempts = [stamp for stamp in ORDER_ATTEMPTS.get(client_key, []) if now - stamp < ORDER_WINDOW_SECONDS]
    if len(attempts) >= ORDER_MAX_ATTEMPTS:
        return jsonify({"error": "Too many requests from this connection. Please try again later."}), 429
    ORDER_ATTEMPTS[client_key] = attempts + [now]
    if (request.form.get("website") or "").strip():
        return jsonify({"error": "The request could not be submitted."}), 400
    required = {"name": "Full name", "phone": "Phone number", "service": "Service", "instructions": "Instructions"}
    values = {key: (request.form.get(key) or "").strip() for key in required}
    missing = [label for key, label in required.items() if not values[key]]
    if missing:
        return jsonify({"error": f"Please provide: {', '.join(missing)}."}), 400
    if len(values["instructions"]) > 5000:
        return jsonify({"error": "Instructions must be 5,000 characters or fewer."}), 400
    try:
        values["phone"] = normalize_kenyan_phone(values["phone"])
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    deadline_value = (request.form.get("deadline") or "").strip()
    if deadline_value:
        try:
            deadline = datetime.strptime(deadline_value, "%Y-%m-%d").date()
            if deadline < datetime.now(timezone.utc).date():
                return jsonify({"error": "Deadline cannot be in the past."}), 400
        except ValueError:
            return jsonify({"error": "Please provide a valid deadline."}), 400
    values["deadline"] = deadline_value
    delivery_method = (request.form.get("delivery_method") or "Portal").strip()
    if delivery_method not in {"WhatsApp", "Portal"}:
        return jsonify({"error": "Choose a valid delivery method."}), 400

    files = request.files.getlist("files")
    if len(files) > MAX_ORDER_FILES:
        return jsonify({"error": f"Attach no more than {MAX_ORDER_FILES} files at once."}), 413
    checked_files = []
    total_bytes = 0
    for uploaded in files:
        if not uploaded or not uploaded.filename:
            continue
        original_name = secure_filename(uploaded.filename)
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if extension not in ORDER_EXTENSIONS:
            return jsonify({"error": f"{uploaded.filename} is not an accepted file type."}), 415
        raw = uploaded.read(ORDER_FILE_BYTES + 1)
        if len(raw) > ORDER_FILE_BYTES:
            return jsonify({"error": f"{uploaded.filename} must be 20MB or smaller."}), 413
        total_bytes += len(raw)
        if total_bytes > MAX_ORDER_TOTAL_BYTES:
            return jsonify({"error": "The combined upload must be 100MB or smaller."}), 413
        try:
            scan_or_reject(raw, original_name)
        except PermissionError as error:
            return jsonify({"error": str(error)}), 422
        except RuntimeError as error:
            app.logger.error("Required malware scan failed: %s", error)
            return jsonify({"error": "Uploads are temporarily unavailable. Please try again later."}), 503
        checked_files.append((uploaded, original_name, raw))

    reference = f"TH-{uuid.uuid4().hex[:8].upper()}"
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        with db_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO orders (reference, name, phone, email, service, instructions, deadline, delivery_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (reference, values["name"], values["phone"], request.form.get("email", "").strip(), values["service"], values["instructions"], values["deadline"], delivery_method, created_at),
            )
            order_id = cursor.lastrowid
            order_dir = os.path.join(ORDER_UPLOAD_DIR, reference)
            os.makedirs(order_dir, exist_ok=True)
            for uploaded, original_name, raw in checked_files:
                stored_name = f"{uuid.uuid4().hex}_{original_name}"
                store_bytes(raw, storage_key("orders", reference, stored_name), uploaded.content_type, os.path.join(order_dir, stored_name))
                connection.execute(
                    "INSERT INTO order_files (order_id, original_name, stored_name, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)",
                    (order_id, original_name, stored_name, uploaded.content_type, len(raw)),
                )
    except Exception:
        app.logger.exception("Could not create order")
        return jsonify({"error": "The request could not be saved. Please try again."}), 500
    return jsonify({"reference": reference, "name": values["name"], "service": values["service"], "deadline": values["deadline"], "status": "New Request", "createdAt": created_at, "fileCount": len(checked_files)}), 201

def enhancement_settings(data):
    def number(name, default):
        try:
            return float(data.get(name, default))
        except (TypeError, ValueError):
            return default
    return {
        "brightness": max(-30, min(40, number("brightness", 5))),
        "contrast": max(-30, min(40, number("contrast", 8))),
        "saturation": max(-30, min(40, number("saturation", 4))),
        "exposure": max(-30, min(30, number("exposure", 0))),
        "highlights": max(-40, min(40, number("highlights", 0))),
        "shadows": max(-40, min(40, number("shadows", 0))),
        "luminance": max(-40, min(40, number("luminance", 0))),
        "temperature": max(-30, min(30, number("temperature", 0))),
        "tint": max(-30, min(30, number("tint", 0))),
        "vibrance": max(-30, min(40, number("vibrance", 0))),
        "sharpness": max(0, min(100, number("sharpness", 12))),
    }

def process_single_image(image, settings):
    image = cv2.resize(image, (min(image.shape[1], 2400), min(image.shape[0], 2400)), interpolation=cv2.INTER_AREA) if max(image.shape[:2]) > 2400 else image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    l_channel = cv2.convertScaleAbs(l_channel, alpha=1 + settings["contrast"] / 100, beta=settings["brightness"] + settings["exposure"] * 4 + settings["luminance"])
    if settings["highlights"] < 0:
        l_channel = np.where(l_channel > 150, l_channel + settings["highlights"] * (l_channel - 150) / 105, l_channel).astype(np.uint8)
    if settings["shadows"] > 0:
        l_channel = np.where(l_channel < 120, l_channel + settings["shadows"] * (120 - l_channel) / 120, l_channel).clip(0, 255).astype(np.uint8)
    a_channel = np.clip(a_channel.astype(np.int16) + settings["tint"], 0, 255).astype(np.uint8)
    b_channel = np.clip(b_channel.astype(np.int16) + settings["temperature"], 0, 255).astype(np.uint8)
    image = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] *= 1 + (settings["saturation"] + settings["vibrance"]) / 100
    image = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    if settings["sharpness"] > 0:
        blurred = cv2.GaussianBlur(image, (0, 0), 1.2)
        amount = settings["sharpness"] / 100
        image = cv2.addWeighted(image, 1 + amount, blurred, -amount, 0)
    if settings.get("noise", 0) > 0:
        image = cv2.fastNlMeansDenoisingColored(image, None, settings["noise"] / 8, settings["noise"] / 8, 7, 21)
    return image

def align(base, img):
    g1 = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(2000)
    k1, d1 = orb.detectAndCompute(g1, None)
    k2, d2 = orb.detectAndCompute(g2, None)
    if d1 is None or d2 is None:
        return img
    m = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
    m = sorted(m, key=lambda x: x.distance)[:200]
    if len(m) < 10:
        return img
    dst = np.float32([k1[x.queryIdx].pt for x in m]).reshape(-1, 1, 2)
    src = np.float32([k2[x.trainIdx].pt for x in m]).reshape(-1, 1, 2)
    H, _ = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if H is None:
        return img
    return cv2.warpPerspective(img, H, (base.shape[1], base.shape[0]))

@app.route("/")
def index():
    built_index = os.path.join("dist", "index.html")
    return send_file(built_index if os.path.exists(built_index) else "index.html")

@app.route("/assets/<path:filename>")
def assets(filename):
    response = send_from_directory(os.path.join("dist", "assets"), filename)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

@app.route("/enhance", methods=["POST"])
def enhance():
    frames = []
    for f in request.files.getlist("frames"):
        arr = np.frombuffer(f.read(), np.uint8)
        frames.append(cv2.imdecode(arr, cv2.IMREAD_COLOR))
    base = frames[0]
    aligned = [base] + [align(base, f) for f in frames[1:]]
    merged = np.mean(np.stack(aligned).astype(np.float32), axis=0)  # noise drops
    merged = np.clip(merged, 0, 255).astype(np.uint8)
    blur = cv2.GaussianBlur(merged, (0, 0), 2)                       # unsharp mask
    sharp = cv2.addWeighted(merged, 1.5, blur, -0.5, 0)
    ok, buf = cv2.imencode(".jpg", sharp, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return send_file(io.BytesIO(buf.tobytes()), mimetype="image/jpeg")

@app.route("/api/enhance", methods=["OPTIONS", "POST"])
def api_enhance():
    if request.method == "OPTIONS":
        return make_response("", 204)
    uploaded = request.files.get("image")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Please provide an image."}), 400
    if uploaded.content_type not in ALLOWED_TYPES:
        return jsonify({"error": "Use a JPG, PNG, or WEBP image."}), 415
    raw = uploaded.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "Image must be 20MB or smaller."}), 413
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return jsonify({"error": "The image could not be decoded."}), 400
    processed = process_single_image(image, enhancement_settings(request.form))
    ok, buffer = cv2.imencode(".jpg", processed, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        return jsonify({"error": "Image processing failed."}), 500
    response = send_file(io.BytesIO(buffer.tobytes()), mimetype="image/jpeg", download_name="lumaforge-enhanced.jpg")
    response.headers["X-Processing-Engine"] = "opencv"
    return response

if __name__ == "__main__":
    # HTTPS is required for phone camera access
    app.run(host="0.0.0.0", port=5000, ssl_context="adhoc")
