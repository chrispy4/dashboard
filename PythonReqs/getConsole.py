import requests
import json

url = "http://192.168.0.18/STRUMISWebServiceCore/api/ProductionConsole/get"

headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6IkNocmlzdGlhbiBQZXJleiBDYXN0YW5hemEiLCJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9kbnMiOiIxOTIuMTY4LjAuMTI0MEhOSkRHOFZDVVZFVCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IkZCNDM5RjgwLTk1OUMtNDI1My1CMkRDLUYzOEI5NUM4ODRBRSIsIm5iZiI6MTc3MTI2MzkzNCwiZXhwIjoxNzcxMjY3NTM0LCJpYXQiOjE3NzEyNjM5MzR9.QB8rCov2edyfLPDLFyyf7MLGwEXs2p58LdIfjOJsARo"
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

print(response.status_code)
# print(response.json())

with open("response.json", "w") as f:
    f.write(response.text)