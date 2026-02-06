from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Mock window.fs and localStorage before navigation
            page.add_init_script("""
                localStorage.setItem("vk_download_path", "C:/Downloads");
                window.fs = {
                    listDirectory: async (path) => {
                        return {
                            path: path,
                            entries: [
                                { name: "Test Folder", path: path + "/Test Folder", isDirectory: true, size: 0, modifiedAt: Date.now() },
                                { name: "Test File.cbz", path: path + "/Test File.cbz", isDirectory: false, size: 5242880, modifiedAt: Date.now() }
                            ]
                        };
                    },
                    openPath: async (path) => {
                        console.log("Opened " + path);
                    }
                };
            """)

            print("Navigating to http://localhost:3000")
            page.goto("http://localhost:3000")

            # Click on "Bibliothèque"
            print("Clicking on Bibliothèque...")
            page.get_by_role("button", name="Bibliothèque").click()

            # Wait a bit for the mock load to happen
            page.wait_for_timeout(2000)

            # Take a screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/library_view_mocked.png")
            print("Screenshot saved to verification/library_view_mocked.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    if not os.path.exists("verification"):
        os.makedirs("verification")
    run()
