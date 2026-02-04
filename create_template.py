import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font

def create_template():
    wb = Workbook()
    ws = wb.active
    ws.title = "Incidentes Modelo"

    # Columns based on script.js extraction logic
    headers = [
        "number",
        "short_description",
        "description",
        "opened_at",
        "resolved_at",
        "closed_at",
        "work_start",
        "work_end",
        "close_notes",
        "work_notes",
        "impact",
        "urgency",
        "made_sla",
        "u_vale_slm_ttn_notes",
        "u_vale_slm_tte_notes"
    ]

    ws.append(headers)

    # Style headers
    for cell in ws[1]:
        cell.font = Font(bold=True)

    # Add a sample row (optional, but helpful for format)
    sample = [
        "INC0000001",
        "Falha de link em Carajás - OT",
        "Descrição detalhada do problema...",
        "2023-10-01 08:00:00",
        "2023-10-01 10:00:00",
        "2023-10-01 10:30:00",
        "2023-10-01 08:30:00",
        "2023-10-01 09:45:00",
        "Problema: Cabo rompido | Solução: Fusão realizada",
        "Equipe em deslocamento... fibra otica rompida...",
        "1 - High",
        "2 - Medium",
        "true",
        "",
        ""
    ]
    ws.append(sample)

    wb.save("model_incident.xlsx")
    print("model_incident.xlsx created successfully.")

if __name__ == "__main__":
    create_template()
