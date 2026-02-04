from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:3000/analise.html")

    # Check for the download link
    link = page.get_by_role("link", name="Baixar Modelo XLSX")
    expect(link).to_be_visible()

    # Optionally check href
    href = link.get_attribute("href")
    if href != "model_incident.xlsx":
        raise Exception(f"Expected href to be model_incident.xlsx, but got {href}")

    page.screenshot(path="verification_model_link.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
