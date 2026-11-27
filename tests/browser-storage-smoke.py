from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("http://127.0.0.1:8765/")
    page.wait_for_function("document.body.textContent.includes('BROWSER_STORAGE_')", timeout=30000)
    result = page.locator("body").inner_text()
    print(result)
    assert result == "BROWSER_STORAGE_PASS", result
    browser.close()
