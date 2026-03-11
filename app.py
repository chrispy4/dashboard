from flask import Flask, jsonify, render_template, send_from_directory
from flask_cors import CORS
import requests
import time
import os
import logging
import sys

from dotenv import set_key, load_dotenv
from pathlib import Path

app = Flask(__name__, template_folder="templates", static_folder="static")

# CORS (you can restrict origin later)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

############################
# TOKEN MANAGEMENT
############################
env_file_path = Path(".env")
load_dotenv()
############################

############################
# Logging to STERR
############################

logging.basicConfig(
    stream = sys.stderr,
    level = logging.ERROR,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)
################################

def get_token(retries=5):
    url = "http://192.168.0.18/STRUMISWebServiceCore/api/User/login"

    headers = {
        "Content-Type": "application/json"
    }

    data = {
        "name": os.getenv("API_USER"),
        "password": os.getenv("API_PASS")
    }

    print("Sending Auth Request...\n")

    try:
        response = requests.post(url, headers=headers, json=data, timeout=10)
    except requests.exceptions.Timeout:
        raise Exception("Auth API timed out")
    except requests.exceptions.ConnectionError:
        raise Exception("Could not reach auth API at 192.168.0.18")

    if response.status_code != 200:
        if retries <=0:
            raise Exception("Auth failed after max retries")
        time.sleep(5)
        return get_token(retries-1)
    
    response_data = response.json()
    token = response_data.get("Token")

    if token:
        set_key(dotenv_path=env_file_path, key_to_set="auth_token", value_to_set=token)
        print("Auth request successful.")
        return token
    raise Exception("Auth Succeeded but no token in response body")


def get_Data(retry=True):
    load_dotenv()
    token = os.getenv("auth_token")

    if not token:
        token = get_token()

    url = "http://192.168.0.18/STRUMISWebServiceCore/api/ProductionConsole/get"

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    data = {
        "workOrderTypeID": 0,
        "contractID": 0,
        "phaseID": 0,
        "lotID": 0,
        "markID": 0,
        "contractItemID": 0,
        "contractBatchID": 0,
        "productionStageID": 3,
        "productionProcessID": 0,
        "productionWorkStationID": 0,
        "displayInstances": False,
        "locationFacilityID": 1,
        "employeeID": 0,
        "processView": 0
    }
    
    try:                                                        # ← add this
        response = requests.post(url, headers=headers, json=data, timeout=10)
    except requests.exceptions.Timeout:
        raise Exception("Data API timed out after 10s")
    except requests.exceptions.ConnectionError:
        raise Exception("Could not reach data API at 192.168.0.18")

    if response.status_code == 401 and retry:
        print("Token expired. Fetching new token...")
        get_token()
        return get_Data(retry=False)

    if response.status_code == 200:
        print("Data request successful.")
        with open("data.json", "w") as f:
            f.write(response.text)
        return response

    print(f"Error: {response.status_code}")
    return response

############################
# ROUTES
############################

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/data.json")
def serve_data():
    return send_from_directory(".", "data.json")


@app.route("/refresh-data", methods=["POST"])
def refresh_data():
    try:
        resp = get_Data()
    except Exception as e:
        logger.error(f"get_Data failed: {e}", exc_info=True)  # exc_info logs full traceback
        return jsonify({"success": False, "reason": str(e)}), 500

    if resp.status_code == 200:
        return jsonify({"success": True})
    logger.error(resp.text)
    return jsonify({"success": False, "reason": resp.text}), 500

############################

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5010, debug=True)