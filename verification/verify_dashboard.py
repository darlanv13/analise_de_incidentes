import os
from playwright.sync_api import sync_playwright

def verify_dashboard():
    cwd = os.getcwd()
    json_path = os.path.join(cwd, "mock_incident.json")
    html_path = os.path.join(cwd, "analise.html")
    screenshot_path = os.path.join(cwd, "verification", "dashboard_verification.png")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 1200})

        # Load the HTML file directly
        page.goto(f"file://{html_path}")

        # Upload the JSON file
        print("Uploading JSON...")
        page.set_input_files("#file", json_path)
        page.click("#loadBtn")

        # Apply filters to show we can interact with them
        # Filter Region = NORTE
        page.select_option("#fRegion", "NORTE")

        # Take screenshot
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_dashboard()
