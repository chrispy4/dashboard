import requests
import time
import os

from dotenv import set_key, load_dotenv
from pathlib import Path

###############Token Mangament################
env_file_path = Path(".env")


##########################

def get_Token():
    url = "http://192.168.0.18/STRUMISWebServiceCore/api/User/login"

    headers = {
    "Content-Type": "application/json"
    }

    data = {
    "name": "Christian Perez Castanaza",
    "password": "password"
    }

    print("Sending Auth Request...\n")
    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        response_data = response.json()
        token = response_data.get("Token")
        set_key(dotenv_path=env_file_path, key_to_set="auth_token", value_to_set=token)
        print(f"Auth_Req Response was 200")
        # print(f"Token: {token}")
        return token
    else:
        print(f"Error: {response.status_code}")
        print("Will wait 10 seconds before retrying...")
        time.sleep(10)
        print("Retrying Auth request...")
        get_Token()

def get_Data():
  load_dotenv()
  token = os.getenv("auth_token")

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

  response = requests.post(url, headers=headers, json=data)

  if response.status_code == 200:
    print("Data_Req Response was 200")
    with open("./data.json", "w") as f:
      f.write(response.text)
      
  else:
    print(f"Error: {response.status_code} \n {response.text}")

  return response.status_code

if os.getenv("auth_token") == "":
  print("No token found, fetching auth token")
  get_Token()  
else:
  print("auth_token found, fetching data")
  code = get_Data()
  if code != 200:
    print("Request was not 200, token could be invalid, fetching token")
    get_Token()
    time.sleep(10)
    get_Data()
  else:
     print("Call using pre-existing token was successful")