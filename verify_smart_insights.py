
import json
import os
from playwright.sync_api import sync_playwright

def verify_smart_insights():
    # Load test data
    with open('test_smart_insights.json', 'r') as f:
        test_data = json.load(f)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        cwd = os.getcwd()
        page.goto(f'file://{cwd}/analise.html')

        # Inject data
        page.evaluate(f"loadFromJSON({json.dumps(test_data)})")
        page.wait_for_timeout(1000)

        # Debugging from browser context
        debug_info = page.evaluate("""() => {
            return {
                raw_len: typeof RAW !== 'undefined' ? RAW.length : 'undefined',
                view_len: typeof VIEW !== 'undefined' ? VIEW.length : 'undefined',
                // We can't access let VIEW_RAW directly if it is scoped inside render()
                // But we can check if analyzeSmartPatterns works on RAW
                test_pattern: typeof analyzeSmartPatterns !== 'undefined' ? analyzeSmartPatterns(RAW) : 'undefined'
            }
        }""")

        print(f"Debug Info: {debug_info}")

        content = page.inner_text("#prbList")
        print("UI Content:\n", content)

        # Assertions
        assert "Evento Massivo Detectado" in content, "Failed to detect Mass Event in UI"
        assert "Falha Crônica" in content, "Failed to detect Chronic in UI"

        browser.close()

if __name__ == "__main__":
    verify_smart_insights()
