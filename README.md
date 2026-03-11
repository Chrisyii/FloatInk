<div align="center">
  <img src="app-icon.png" width="160" alt="FloatInk Logo" />

  <h1>🖋️ FloatInk</h1>

  <p>
    <strong>A modern, screen-agnostic annotation tool for macOS.</strong>
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#development">Development</a> •
    <a href="#license">License</a>
  </p>
</div>

<br />

FloatInk is a sleek, lightweight, and powerful screen annotation utility designed specifically for macOS. Whether you're presenting, recording tutorials, or just need to visually mark up your screen, FloatInk gives you a frictionless "draw anywhere" experience built on top of modern web technologies using [Tauri](https://tauri.app/).

## ✨ Features

- **Draw Anywhere:** An overlay that sits on top of all your applications, allowing you to annotate freely.
- **Native macOS Feel:** Designed to look and feel like a first-class citizen on your Mac.
- **Blazing Fast:** Powered by Tauri (Rust + Webview), taking virtually zero resources in the background.
- **Stunning UI:** Features a meticulously crafted, glassmorphic UI and a beautiful bespoke app icon.
- **Offline First:** Fully local, privacy-respecting, and fast.

## 🚀 Installation

*Pre-compiled binaries will be available in the upcoming Releases section soon.*

For now, you can build FloatInk from source.

## 💻 Development

FloatInk is built with **Tauri**. To get started with development, you'll need Node.js and the Rust toolchain installed.

### Pre-requisites

1. Install [Node.js](https://nodejs.org/)
2. Install [Rust](https://www.rust-lang.org/tools/install)
3. Follow the [Tauri macOS environment setup guide](https://tauri.app/v1/guides/getting-started/prerequisites#macos)

### Getting Started

1. Clone the repository:
   ```bash
   git clone git@github.com:Chrisyii/FloatInk.git
   cd FloatInk
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode (with hot-module reloading):
   ```bash
   npm run dev
   ```

4. Build the release bundle (.app / .dmg):
   ```bash
   npm run build
   ```

## 🎨 Design & Assets

The application icon and core visual identity have been completely custom-designed for this project, adhering strictly to the Apple Human Interface Guidelines for squircle dimension padding (82.4% ratio) to look perfectly native in your Dock.

## 📜 License

This project is open-sourced under the [MIT License](LICENSE).
