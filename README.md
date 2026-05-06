<!-- title with icon of app -->


# <img src="assets/icons/icon_app_48.png" alt="Logo" height="36"> Interactive Previews - browser extension

This repository contains the source code and documentation for my **Bachelor Thesis** at the University of Pardubice - Faculty of Electrical Engineering and Informatics.

## 🎓 About the Project

**Interactive Previews** is a modern browser extension designed to increase web browsing efficiency. Instead of constantly clicking links to view images or download PDF files, this extension allows you to instantly preview them by simply hovering your mouse cursor over the link.

### Features
* 🖼️ **Instant Image Previews**: Automatically finds and displays the highest resolution image available using `srcset` and `sizes`.
* 📄 **Native PDF Rendering**: Integrated `PDF.js` library allows rendering multi-page PDF documents securely without downloading them locally.
* ⚙️ **Granular Control**: Use the Options page to enable or disable the extension on specific domains (Whitelist/Blacklist) with full Regular Expression (Regex) support.
* 🚀 **Performance Optimized**: Built with Manifest V3, utilizing Service Workers and asynchronous Fetch API.

## 📥 Installation

This extension is currently in development and can be installed manually (unpacked) in your browser.

### For Google Chrome / Edge / Brave:
1. Download or clone this repository to your local machine.
2. Open your browser and go to `chrome://extensions/`.
3. Enable **"Developer mode"** (usually a toggle in the top right corner).
4. Click on **"Load unpacked"** and select the `src` folder from this repository.
5. The extension is now installed and ready to use!

### For Mozilla Firefox:
1. Download or clone this repository.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click on **"Load Temporary Add-on..."**
4. Navigate to the `src` folder and select the `manifest.json` file.
5. The extension will be loaded temporarily (it will be removed when you restart Firefox).

## 📚 Thesis Documentation (PDF)

The full text of the bachelor thesis, written in Czech, including theoretical background, architecture design, and testing results, can be found here:

👉 **[Documentation/Voronkin_Tymofii_BP_2026.pdf](./Documentation/Voronkin_Tymofii_BP_2026.pdf)**


### LaTeX Live Preview

The LaTeX source files used to compile this document are located in the `Documentation/LaTeX` directory.

To automatically recompile the PDF on every file save and view it live in [SumatraPDF](https://www.sumatrapdfreader.org/):

```bash
cd Documentation/LaTeX
latexmk -pdf -pvc main.tex
```

> `-pvc` (preview continuously) watches for file changes and recompiles automatically. SumatraPDF reloads the PDF in place without locking the file, making it ideal for this workflow. Requires a TeX distribution ([TeX Live](https://tug.org/texlive/) or [MiKTeX](https://miktex.org/)).
