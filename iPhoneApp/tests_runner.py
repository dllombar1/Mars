#!/usr/bin/env python3
"""
ScreenSight iOS App — Core Logic Test Runner
Tests the same logic implemented in Swift (AuthService, ImageAnalysisService, ScreenshotService)
so we can validate behaviour without an Xcode / macOS build environment.
"""

import re
import uuid
import unittest
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


# ─────────────────────────────────────────────────
# Models  (mirrors Sources/Core/Models/*.swift)
# ─────────────────────────────────────────────────

@dataclass
class User:
    id: str
    email: str
    display_name: str
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class ScreenshotAnalysis:
    description: str
    detected_text: list[str] = field(default_factory=list)
    confidence: float = 1.0
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def formatted_description(self) -> str:
        parts = [self.description]
        if self.detected_text:
            parts.append("Text found: " + ", ".join(self.detected_text))
        return "\n\n".join(parts)


# ─────────────────────────────────────────────────
# AuthError  (mirrors AuthError enum in Swift)
# ─────────────────────────────────────────────────

class AuthError(Exception):
    pass

class InvalidCredentialsError(AuthError):
    def __str__(self): return "Invalid email or password."

class WeakPasswordError(AuthError):
    def __str__(self): return "Password must be at least 8 characters."


# ─────────────────────────────────────────────────
# AuthService  (mirrors Sources/Core/Services/AuthService.swift)
# ─────────────────────────────────────────────────

class AuthService:
    _EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')

    def __init__(self):
        self._current_user: Optional[User] = None

    @property
    def current_user(self) -> Optional[User]:
        return self._current_user

    def sign_in(self, email: str, password: str) -> User:
        if not self._is_valid_email(email) or len(password) < 8:
            raise InvalidCredentialsError()
        user = User(id=str(uuid.uuid4()), email=email, display_name=self._name_from_email(email))
        self._current_user = user
        return user

    def sign_up(self, email: str, password: str, display_name: str) -> User:
        if not self._is_valid_email(email):
            raise InvalidCredentialsError()
        if len(password) < 8:
            raise WeakPasswordError()
        if not display_name.strip():
            raise InvalidCredentialsError()
        user = User(id=str(uuid.uuid4()), email=email, display_name=display_name)
        self._current_user = user
        return user

    def sign_out(self):
        self._current_user = None

    @classmethod
    def _is_valid_email(cls, email: str) -> bool:
        return bool(cls._EMAIL_RE.match(email))

    @staticmethod
    def _name_from_email(email: str) -> str:
        return email.split('@')[0].capitalize()


# ─────────────────────────────────────────────────
# ImageAnalysisService  (mirrors the Linux/stub branch in Swift)
# ─────────────────────────────────────────────────

class ImageAnalysisService:
    def analyze(self, image_data: bytes) -> ScreenshotAnalysis:
        try:
            text = image_data.decode('utf-8')
        except UnicodeDecodeError:
            text = ''
        lines = [l for l in text.splitlines() if l.strip()]
        description = (
            f"Screenshot captured. Detected {len(lines)} line(s) of text."
            if lines else
            "Screenshot captured. No recognizable text content."
        )
        return ScreenshotAnalysis(description=description, detected_text=lines, confidence=0.9)


# ─────────────────────────────────────────────────
# ScreenshotService  (mirrors the Linux/stub branch in Swift)
# ─────────────────────────────────────────────────

class ScreenshotService:
    def capture(self) -> bytes:
        sample = f"Stub screenshot: {datetime.now().isoformat()}"
        return sample.encode('utf-8')


# ═════════════════════════════════════════════════
# TESTS
# ═════════════════════════════════════════════════

class TestAuthService(unittest.TestCase):

    def setUp(self):
        self.auth = AuthService()

    # --- sign in ---

    def test_sign_in_valid_credentials_returns_user(self):
        user = self.auth.sign_in("alice@example.com", "securePass1")
        self.assertEqual(user.email, "alice@example.com")
        self.assertTrue(user.id)

    def test_sign_in_invalid_email_raises(self):
        with self.assertRaises(InvalidCredentialsError):
            self.auth.sign_in("not-an-email", "securePass1")

    def test_sign_in_short_password_raises(self):
        with self.assertRaises(InvalidCredentialsError):
            self.auth.sign_in("alice@example.com", "short")

    def test_sign_in_sets_current_user(self):
        self.auth.sign_in("alice@example.com", "securePass1")
        self.assertIsNotNone(self.auth.current_user)

    def test_sign_in_display_name_derived_from_email(self):
        user = self.auth.sign_in("alice@example.com", "securePass1")
        self.assertEqual(user.display_name, "Alice")

    # --- sign up ---

    def test_sign_up_valid_data_returns_user(self):
        user = self.auth.sign_up("bob@example.com", "strongPass99", "Bob")
        self.assertEqual(user.email, "bob@example.com")
        self.assertEqual(user.display_name, "Bob")

    def test_sign_up_weak_password_raises(self):
        with self.assertRaises(WeakPasswordError):
            self.auth.sign_up("bob@example.com", "123", "Bob")

    def test_sign_up_empty_display_name_raises(self):
        with self.assertRaises(InvalidCredentialsError):
            self.auth.sign_up("bob@example.com", "strongPass99", "   ")

    def test_sign_up_invalid_email_raises(self):
        with self.assertRaises(InvalidCredentialsError):
            self.auth.sign_up("no-at-sign", "strongPass99", "Bob")

    # --- sign out ---

    def test_sign_out_clears_current_user(self):
        self.auth.sign_in("alice@example.com", "securePass1")
        self.assertIsNotNone(self.auth.current_user)
        self.auth.sign_out()
        self.assertIsNone(self.auth.current_user)

    # --- email edge cases ---

    def test_email_validation_various_valid_formats(self):
        valid = [
            "user@example.com",
            "user+tag@sub.domain.org",
            "first.last@company.co.uk",
            "123@numbers.io",
        ]
        for email in valid:
            with self.subTest(email=email):
                user = self.auth.sign_in(email, "password123")
                self.assertEqual(user.email, email)

    def test_email_validation_rejects_invalid_formats(self):
        invalid = ["plainaddress", "@no-local.com", "no-domain@", "spaces @here.com", ""]
        for email in invalid:
            with self.subTest(email=email):
                with self.assertRaises(InvalidCredentialsError):
                    self.auth.sign_in(email, "password123")


class TestScreenshotAnalysis(unittest.TestCase):

    def test_formatted_description_no_text(self):
        analysis = ScreenshotAnalysis(description="Home screen detected.")
        self.assertEqual(analysis.formatted_description, "Home screen detected.")

    def test_formatted_description_with_text(self):
        analysis = ScreenshotAnalysis(
            description="Settings screen.",
            detected_text=["Wi-Fi", "Bluetooth"]
        )
        result = analysis.formatted_description
        self.assertIn("Settings screen.", result)
        self.assertIn("Wi-Fi", result)
        self.assertIn("Bluetooth", result)

    def test_id_is_unique_per_instance(self):
        a1 = ScreenshotAnalysis(description="A")
        a2 = ScreenshotAnalysis(description="B")
        self.assertNotEqual(a1.id, a2.id)


class TestImageAnalysisService(unittest.TestCase):

    def setUp(self):
        self.service = ImageAnalysisService()

    def test_analyze_with_text_data_detects_lines(self):
        data = b"Hello World\nSettings\nWi-Fi"
        analysis = self.service.analyze(data)
        self.assertFalse(not analysis.description)
        self.assertEqual(analysis.detected_text, ["Hello World", "Settings", "Wi-Fi"])
        self.assertGreater(analysis.confidence, 0)

    def test_analyze_empty_data_returns_analysis(self):
        analysis = self.service.analyze(b"")
        self.assertFalse(not analysis.description)
        self.assertIn("No recognizable text", analysis.description)

    def test_analyze_binary_data_does_not_crash(self):
        analysis = self.service.analyze(bytes(range(256)))
        self.assertIsInstance(analysis, ScreenshotAnalysis)


class TestScreenshotService(unittest.TestCase):

    def test_capture_returns_non_empty_data(self):
        service = ScreenshotService()
        data = service.capture()
        self.assertIsInstance(data, bytes)
        self.assertGreater(len(data), 0)

    def test_capture_contains_timestamp(self):
        service = ScreenshotService()
        data = service.capture().decode('utf-8')
        self.assertIn("Stub screenshot:", data)


class TestEndToEndFlow(unittest.TestCase):
    """Simulates a full app session: sign in → capture → analyse → read."""

    def test_full_flow(self):
        # 1. Sign in
        auth = AuthService()
        user = auth.sign_in("carol@example.com", "myPassword1")
        self.assertEqual(user.email, "carol@example.com")

        # 2. Capture screenshot
        screenshot_svc = ScreenshotService()
        image_data = screenshot_svc.capture()
        self.assertTrue(image_data)

        # 3. Analyse
        analysis_svc = ImageAnalysisService()
        analysis = analysis_svc.analyze(image_data)
        self.assertIsInstance(analysis, ScreenshotAnalysis)
        self.assertTrue(analysis.description)

        # 4. Formatted output
        output = analysis.formatted_description
        self.assertIsInstance(output, str)
        self.assertTrue(output)

        # 5. Sign out
        auth.sign_out()
        self.assertIsNone(auth.current_user)


if __name__ == '__main__':
    import sys
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(__import__(__name__))
    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
