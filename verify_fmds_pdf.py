
import json
import os
from playwright.sync_api import sync_playwright

def verify_fmds_pdf():
    # Load test data
    with open('test_smart_insights.json', 'r') as f:
        test_data = json.load(f)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        cwd = os.getcwd()
        page.goto(f'file://{cwd}/analise.html')

        # Inject data
        page.evaluate(f"loadFromJSON({json.dumps(test_data)})")

        # Trigger PDF generation
        print("Clicking PDF button...")
        try:
            with page.expect_download(timeout=10000) as download_info:
                page.click("#pdfBtn")

            download = download_info.value
            print(f"Download started: {download.suggested_filename}")
            download.save_as("test_fmds.pdf")
            print("PDF saved successfully.")
        except Exception as e:
            print(f"PDF Generation Failed: {e}")

            # Check for JS errors that might have happened during click
            # Sometimes html2canvas errors are caught in the catch block in JS and logged

        browser.close()

if __name__ == "__main__":
    verify_fmds_pdf()
