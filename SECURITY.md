# 🔒 Security Policy

## Supported Versions

We actively provide security patches and updates for the latest versions of **Mermaid Browser & Live Editor**.

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| < 0.3.0 | :x:                |

---

## Architecture & Security Model

Mermaid Browser & Live Editor is engineered with a strict **local-first, zero-cloud architecture**:
- **No Remote Telemetry:** The extension operates 100% offline and transmits zero data over the internet.
- **Strict Content Security Policy (CSP):** All webview interfaces (the Diagram Browser, Live Editor, and PDF Renderer) operate with unique cryptographically random per-session nonces and disallow unauthorized inline scripts or remote script execution.
- **DOM Sanitization:** All user-provided Markdown, MathML, and SVG contents pass through **DOMPurify** before insertion into DOM trees to prevent Cross-Site Scripting (XSS).

---

## Reporting a Vulnerability

If you discover a potential security vulnerability:

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via [GitHub Security Advisories](https://github.com/Dragonwinner/Mermaid-Browser-Live-Editor/security/advisories/new) or by reaching out to the maintainers directly.
3. Include:
   - A detailed description of the vulnerability and affected components.
   - Exact steps or proof-of-concept markdown/diagram snippet to reproduce the behavior.
   - Estimated severity and impact.

We will acknowledge reports within 48 hours and coordinate release of a verified fix.
