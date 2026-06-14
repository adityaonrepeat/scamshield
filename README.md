# ScamShield

![ScamShield](scamshield-banner.png)

A browser extension that detects phishing and scam websites using on-device machine learning inference (TensorFlow.js) combined with URL heuristics. No data leaves your browser.

## How it works

Every page you visit is scored in two stages:

1. **Heuristic analysis**: checks URL/DOM signals like HTTP vs HTTPS, URL length, excessive hyphens, password form presence, homograph characters in the hostname, and the `.edu` domain discount.
2. **ML inference**: a TensorFlow.js model (trained on 364k URLs) predicts phishing probability from 16 scaled URL features.

Final score = `30% heuristic + 70% ML`. Strong heuristic signals (≥70) and high ML confidence (≥90%) can each independently escalate the result to red regardless of the blend.

| Score | Mode | Meaning |
|-------|------|---------|
| 0-29 | Green | Appears safe |
| 30-70 | Yellow | Suspicious, proceed with caution |
| 71-100 | Red | High risk, leave the page |

## Architecture

```mermaid
flowchart TD
    subgraph Page["Web page (every URL)"]
        CS["content.ts<br/>(content script)"]
    end

    subgraph Logic["On-device analysis pipeline"]
        FE["features.ts<br/>extractAllFeatures()"]
        CL["classifier.ts<br/>analyzeURL()"]
        TF["TensorFlow.js<br/>graph model, WASM backend"]
    end

    SW["background.ts<br/>(service worker)"]
    ST[("browser.storage.local")]
    POP["popup/App.tsx<br/>(React)"]

    CS -->|"URL + DOM"| FE
    FE -->|"heuristic + 16 scaled features"| CL
    CL -->|"whitelist / trusted-domain check"| ST
    CL -->|"[1,16] tensor"| TF
    TF -->|"phishing probability"| CL
    CL -->|"AnalysisResult"| CS
    CS -->|"Shadow DOM alert<br/>(red overlay / yellow toast)"| Page
    CS -->|"cacheAnalysisResult"| SW
    SW -->|"set scamShieldLastAnalysis_&lt;tabId&gt;"| ST
    POP -->|"getStatusPopup"| SW
    SW -->|"cached result"| POP
    POP -->|"reanalyzePage"| CS

    classDef store fill:#1f2937,stroke:#6b7280,color:#e5e7eb;
    class ST store;
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a component-level breakdown.

## ML model

- Architecture: `Input(16) → Dense(32, relu) → Dense(16, relu) → Dense(1, sigmoid)`
- Training set: 364,198 URLs (201,736 legitimate, 162,462 phishing), 80/20 split, 10 epochs
- Test accuracy: 88.47%
- Inference runs entirely on-device via the TF.js WASM backend

## Development

```powershell
npm install
npm run dev          # Chrome with extension loaded
npm run dev:firefox
npm run build
npm run build:firefox
npm run zip          # Package for Chrome Web Store
npm run compile      # TypeScript check only
```

Requires Node 18+.

## Retraining the model

The model was trained in Google Colab. To retrain: extract the same 16 URL features (see `utils/features.ts`), apply MinMaxScaler normalization, then convert the Keras model with `tensorflowjs_converter`. Copy the new scaler min/range arrays into `utils/features.ts` (`SCALER_MIN_ARRAY` and `SCALER_SCALE_ARRAY`).
