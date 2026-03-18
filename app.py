from flask import Flask, jsonify, render_template, send_from_directory
from flask_cors import CORS
import requests
import time
import os
import logging
import sys
from logging.handlers import RotatingFileHandler

from dotenv import set_key, load_dotenv
from pathlib import Path

app = Flask(__name__, template_folder="templates", static_folder="static")

CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

############################
# TOKEN MANAGEMENT
############################
env_file_path = Path(".env")
load_dotenv()

############################
# LOGGING
############################
LOG_FILE         = "app.log"
LOG_MAX_BYTES    = 5 * 1024 * 1024
LOG_BACKUP_COUNT = 3

log_formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

file_handler = RotatingFileHandler(LOG_FILE, maxBytes=LOG_MAX_BYTES,
                                   backupCount=LOG_BACKUP_COUNT, encoding="utf-8")
file_handler.setLevel(logging.ERROR)
file_handler.setFormatter(log_formatter)

stderr_handler = logging.StreamHandler(sys.stderr)
stderr_handler.setLevel(logging.ERROR)
stderr_handler.setFormatter(log_formatter)

logger = logging.getLogger(__name__)
logger.setLevel(logging.ERROR)
logger.addHandler(file_handler)
logger.addHandler(stderr_handler)

################################

def get_token(retries=5, _attempt=1):
    MAX_RETRIES = 5
    url = "http://192.168.0.18/STRUMISWebServiceCore/api/User/login"

    headers = {
        "Content-Type": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }

    data = {
        "name":     os.getenv("API_USER"),
        "password": os.getenv("API_PASS")
    }

    print(f"Sending Auth Request (attempt {_attempt}/{MAX_RETRIES})...\n")

    t_start = time.monotonic()
    try:
        req      = requests.Request("POST", url, headers=headers, json=data)
        prepared = req.prepare()
        print("=== OUTGOING REQUEST ===")
        print("HEADERS:", dict(prepared.headers))
        print("BODY:",    prepared.body)
        print("========================")
        response = requests.Session().send(prepared, timeout=10)
    except requests.exceptions.Timeout:
        elapsed = time.monotonic() - t_start
        logger.error("Auth API timed out after %.2fs (attempt %d/%d)",
                     elapsed, _attempt, MAX_RETRIES, exc_info=True)
        raise Exception(f"Auth API timed out after {elapsed:.2f}s")
    except requests.exceptions.ConnectionError as e:
        elapsed = time.monotonic() - t_start
        logger.error("Could not reach auth API at 192.168.0.18 after %.2fs (attempt %d/%d): %s",
                     elapsed, _attempt, MAX_RETRIES, e, exc_info=True)
        raise Exception(f"Could not reach auth API at 192.168.0.18: {e}")

    elapsed = time.monotonic() - t_start

    if response.status_code != 200:
        logger.error(
            "Auth attempt %d/%d FAILED | status=%s | elapsed=%.2fs\n"
            "  Response headers: %s\n  Response body:    %s",
            _attempt, MAX_RETRIES, response.status_code, elapsed,
            dict(response.headers), response.text
        )
        if retries <= 0:
            raise Exception(
                f"Auth failed after {MAX_RETRIES} attempts. "
                f"Last status: {response.status_code}. Last body: {response.text}"
            )
        print(f"Auth failed (attempt {_attempt}), retrying in 5s...")
        time.sleep(5)
        return get_token(retries - 1, _attempt=_attempt + 1)

    response_data = response.json()
    token = response_data.get("Token")

    if token:
        set_key(dotenv_path=env_file_path, key_to_set="auth_token", value_to_set=token)
        print(f"Auth request successful (attempt {_attempt}, elapsed {elapsed:.2f}s).")
        return token

    logger.error(
        "Auth HTTP 200 but no 'Token' field in response (attempt %d/%d) | elapsed=%.2fs\n"
        "  Response headers: %s\n  Response body:    %s",
        _attempt, MAX_RETRIES, elapsed, dict(response.headers), response.text
    )
    raise Exception(f"Auth returned 200 but no token. Body: {response.text}")


def get_Data(retry=True, production_stage_id=3, output_file="data.json"):
    """
    Fetch production console data from the Strumis API.

    Parameters
    ----------
    production_stage_id : int
        The Strumis productionStageID to query.
        3  = Fabrication  → saved as data.json   (default)
        4  = Coating      → saved as data2.json
        (adjust IDs to match your Strumis configuration)
    output_file : str
        Filename to write the raw JSON response to.
    """
    load_dotenv(override=True)
    token = os.getenv("auth_token")

    if not token:
        token = get_token()

    url = "http://192.168.0.18/STRUMISWebServiceCore/api/ProductionConsole/get"

    headers = {
        "Accept":        "application/json",
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {token}"
    }

    data = {
        "workOrderTypeID":         0,
        "contractID":              0,
        "phaseID":                 0,
        "lotID":                   0,
        "markID":                  0,
        "contractItemID":          0,
        "contractBatchID":         0,
        "productionStageID":       production_stage_id,
        "productionProcessID":     0,
        "productionWorkStationID": 0,
        "displayInstances":        False,
        "locationFacilityID":      1,
        "employeeID":              0,
        "processView":             0
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=(5, 30))
    except requests.exceptions.Timeout:
        logger.error("Data API timed out (stage=%s)", production_stage_id, exc_info=True)
        raise Exception("Data API timed out after 30s")
    except requests.exceptions.ConnectionError:
        logger.error("Could not reach data API at 192.168.0.18 (stage=%s)",
                     production_stage_id, exc_info=True)
        raise Exception("Could not reach data API at 192.168.0.18")

    if response.status_code == 401 and retry:
        print("Token expired (401). Fetching new token and retrying once...")
        logger.error("Data API returned 401 | headers: %s | body: %s",
                     dict(response.headers), response.text)
        get_token()
        return get_Data(retry=False,
                        production_stage_id=production_stage_id,
                        output_file=output_file)

    if response.status_code == 200:
        print(f"Data request successful (stage={production_stage_id}, file={output_file}).")
        with open(output_file, "w") as f:
            f.write(response.text)
        return response

    logger.error(
        "Data API returned unexpected status %s (stage=%s)\n"
        "  Response headers: %s\n  Response body:    %s",
        response.status_code, production_stage_id,
        dict(response.headers), response.text
    )
    print(f"Error: {response.status_code}")
    return response

############################
# ROUTES
############################

@app.route("/")
def home():
    """Fabrication page — Not In Shop / In Shop."""
    return render_template("index.html")


@app.route("/coating")
def coating():
    """Coating page — Ready for Coating / In Coating."""
    return render_template("coating.html")


@app.route("/data.json")
def serve_data():
    return send_from_directory(".", "data.json")


@app.route("/data2.json")
def serve_data2():
    return send_from_directory(".", "data2.json")


@app.route("/refresh-data", methods=["POST"])
def refresh_data():
    """Fabrication page — fetches data.json (productionStageID=3)."""
    try:
        resp = get_Data(production_stage_id=3, output_file="data.json")
    except Exception as e:
        logger.error("get_Data (fab) failed: %s", e, exc_info=True)
        return jsonify({"success": False, "reason": str(e)}), 500

    if resp.status_code == 200:
        return jsonify({"success": True})

    logger.error(
        "refresh_data: non-200 response %s\n"
        "  Response headers: %s\n  Response body:    %s",
        resp.status_code, dict(resp.headers), resp.text
    )
    return jsonify({
        "success":     False,
        "http_status": resp.status_code,
        "reason":      resp.text,
        "headers":     dict(resp.headers)
    }), 500


@app.route("/refresh-data2", methods=["POST"])
def refresh_data2():
    """Coating page — fetches data2.json (productionStageID=4).
    
    Adjust production_stage_id to match your Strumis coating stage.
    """
    try:
        resp = get_Data(production_stage_id=4, output_file="data2.json")
    except Exception as e:
        logger.error("get_Data (coating) failed: %s", e, exc_info=True)
        return jsonify({"success": False, "reason": str(e)}), 500

    if resp.status_code == 200:
        return jsonify({"success": True})

    logger.error(
        "refresh_data2: non-200 response %s\n"
        "  Response headers: %s\n  Response body:    %s",
        resp.status_code, dict(resp.headers), resp.text
    )
    return jsonify({
        "success":     False,
        "http_status": resp.status_code,
        "reason":      resp.text,
        "headers":     dict(resp.headers)
    }), 500

############################

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5010, debug=True)