from __future__ import annotations

import contextlib
import functools
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import Error, expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD_DIR = ROOT / "dashboard"


def find_free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@contextlib.contextmanager
def local_dashboard_server():
    port = find_free_port()
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(DASHBOARD_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


def click_if_visible(page, selector: str) -> bool:
    locator = page.locator(selector).first
    try:
        if locator.is_visible(timeout=1500):
            locator.click()
            return True
    except Error:
        return False
    return False


def test_dashboard_demo_smoke() -> None:
    with local_dashboard_server() as base_url, sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.goto(f"{base_url}/live.html", wait_until="domcontentloaded")

        expect(page.locator("#systemToggleBtn")).to_be_visible(timeout=10_000)
        page.locator("#systemToggleBtn").click()
        expect(page.locator("#demoModeBtn")).to_be_visible(timeout=10_000)
        page.locator("#demoModeBtn").click()

        expect(page.locator("[data-view='clients']")).to_be_visible(timeout=10_000)
        page.locator("[data-view='clients']").click()
        expect(page.locator(".client-trigger").first).to_be_visible(timeout=10_000)

        page.locator(".client-trigger").first.click()
        expect(page.locator(".client-modal:not(.hidden)")).to_be_visible(timeout=10_000)
        expect(page.locator(".client-modal .focus-fact-card").first).to_be_visible(timeout=10_000)
        expect(page.locator(".client-modal .focus-source").first).to_be_visible(timeout=10_000)
        expect(page.locator(".client-modal [data-focus-edit='membershipEnd']").first).to_be_visible(timeout=10_000)

        page.locator(".client-modal [data-focus-edit='membershipEnd']").first.click()
        expect(page.locator(".client-modal .membership-end-editor")).to_be_visible(timeout=10_000)
        page.locator("#clientMembershipEndDate").fill("2026-12-31")
        page.locator("#saveClientMembershipEndBtn").click()
        expect(page.locator("#toast")).to_contain_text("Fin membership", timeout=10_000)

        page.locator("[data-close-client-modal='true']").last.click()
        expect(page.locator(".client-modal.hidden")).to_be_attached(timeout=10_000)

        page.locator("[data-view='mission']").click()
        expect(page.locator("#quickCaptureText")).to_be_visible(timeout=10_000)
        page.locator("#quickCaptureText").fill("Contacter Alex demain pour valider son prochain objectif.")
        page.locator("#quickCaptureBtn").click()
        expect(page.locator("#toast")).to_be_visible(timeout=10_000)

        browser.close()


if __name__ == "__main__":
    test_dashboard_demo_smoke()
    print("Dashboard smoke test passed.")
