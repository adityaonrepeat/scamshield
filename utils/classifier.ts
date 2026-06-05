import * as tf from '@tensorflow/tfjs';
import { extractAllFeatures, GLOBALLY_TRUSTED_DOMAINS, ExtractedFeatures } from './features';

const MODEL_PATH = browser.runtime.getURL('/model/model.json' as any);
const INPUT_NODE_NAME = 'inputs'; // Default

// Storage Keys
const P2P_ENABLED_KEY = 'scamShieldP2PEnabled';
const P2P_USER_CONFIRMED_SAFE_KEY = 'scamShieldP2PUserSafe';
const P2P_USER_CONFIRMED_PHISHING_KEY = 'scamShieldP2PUserPhishing';
const WHITELIST_KEY = 'scamShieldWhitelist';

let model: tf.GraphModel | tf.LayersModel | null = null;
let initialModelLoadPromise: Promise<tf.GraphModel | tf.LayersModel | null> | null = null;

// -----------------------------------------------------------------------------------
// IMPORTANT: MODEL LOADER CONFIGURATION
// -----------------------------------------------------------------------------------
// If you trained your model in Google Colab using "model.save('tfjs_model')", 
// you have a LAYERS model. 
// If you used "tensorflowjs_converter ... --input_format=tf_saved_model", 
// you have a GRAPH model.
//
// AUTO-DETECTION LOGIC:
// We try to load as a Graph Model first (faster). If that fails, we fallback 
// to Layers Model.
// -----------------------------------------------------------------------------------

export async function loadModel(): Promise<tf.GraphModel | tf.LayersModel | null> {
  if (model) return model;

  const loadGraph = async () => {
      try {
        console.log('MODEL_LOADER: Attempting to load Graph Model...');
        return await tf.loadGraphModel(MODEL_PATH, { strict: false });
      } catch(e) { return null; }
  };

  const loadLayers = async () => {
      try {
        console.log('MODEL_LOADER: Graph load failed. Attempting to load Layers Model...');
        return await tf.loadLayersModel(MODEL_PATH);
      } catch(e) { return null; }
  };

  try {
    // Try Graph first, then Layers
    model = await loadGraph();
    if (!model) {
        model = await loadLayers();
    }
    
    if (!model) {
        throw new Error("Could not load model as Graph OR Layers model.");
    }

    console.log('MODEL_LOADER: Model loaded successfully.');
    
    // Warmup
    tf.tidy(() => {
        if(!model) return;
        const warmupInput = tf.zeros([1, 16]);
        try {
             model.predict(warmupInput);
        } catch (e) {
            console.error('Warmup failed', e);
        }
    });

    return model;
  } catch (e) {
    console.error('MODEL_LOADER: Failed to load model', e);
    return null;
  }
}

export function initModelLoader() {
    initialModelLoadPromise = loadModel();
}

export interface AnalysisResult {
  score: number;
  mode: 'red' | 'yellow' | 'green' | 'error' | 'N/A';
  features: ExtractedFeatures['heuristicFeatures'];
  whitelisted: boolean;
  url: string;
  modelUsed: boolean;
  heuristicScoreCalculated: number;
  modelPredictionRaw: number;
}

// Helper to safely execute the model (Graph or Layers)
function makePrediction(model: tf.GraphModel | tf.LayersModel, input: tf.Tensor): tf.Tensor {
    if (model instanceof tf.GraphModel) {
        // Graph Model uses .execute() or .predict()
        // But for safety, .predict() handles tensor inputs correctly in newer TFJS
        return model.predict(input) as tf.Tensor;
    } else {
         // Layers Model uses .predict()
         return model.predict(input) as tf.Tensor;
    }
}

export async function analyzeURL(url: string, dom: Document): Promise<AnalysisResult> {
  await initialModelLoadPromise;

  const extractedData = extractAllFeatures(url, dom);
  const { heuristicFeatures, scaledMlFeatures } = extractedData;
  const hostname = heuristicFeatures.hostname;

  // 1. Storage Checks (Whitelist & P2P)
  const storage = await browser.storage.local.get([
      WHITELIST_KEY, 
      P2P_ENABLED_KEY, 
      P2P_USER_CONFIRMED_SAFE_KEY, 
      P2P_USER_CONFIRMED_PHISHING_KEY
  ]);
  
  const whitelist = (storage[WHITELIST_KEY] as string[]) || [];

  // Check whitelist
  if (whitelist.includes(hostname)) {
      return createResult(0, 'green', heuristicFeatures, true, url, false, 0, 0);
  }

  // Check Global Trust
  for (const trusted of GLOBALLY_TRUSTED_DOMAINS) {
    if (hostname === trusted || hostname.endsWith('.' + trusted)) {
        if (!heuristicFeatures.hasHomograph) {
            return createResult(0, 'green', heuristicFeatures, true, url, false, 0, 0);
        }
    }
  }

  // P2P Check
  let p2pInfluence = 0;
  if (storage[P2P_ENABLED_KEY]) {
      const p2pPhishing = (storage[P2P_USER_CONFIRMED_PHISHING_KEY] as string[]) || [];
      const p2pSafe = (storage[P2P_USER_CONFIRMED_SAFE_KEY] as string[]) || [];
      
      if (p2pPhishing.includes(hostname)) {
          heuristicFeatures.p2pFlag = 'p2p_phishing';
          p2pInfluence = 70;
      } else if (p2pSafe.includes(hostname)) {
          heuristicFeatures.p2pFlag = 'p2p_safe';
          p2pInfluence = -30;
      }
  }

  // Heuristic Score Calculation
  let heuristicScore = 0;
  if (heuristicFeatures.length > 50 && !url.includes('/chat/') && !url.includes('/session/')) {
       heuristicScore += 20;
  }
  // Simplified Hyphen check from original
  if ((url.match(/-/g) || []).length > 5) { 
      heuristicScore += 20; // assumed value from missing context
  }
  if (heuristicFeatures.isHTTP) heuristicScore += 40;
  if (heuristicFeatures.hasForms) heuristicScore += 30;
  if (heuristicFeatures.isEdu) heuristicScore = Math.max(0, heuristicScore - 20);
  if (heuristicFeatures.hasHomograph) heuristicScore += 60;
  
  heuristicScore += p2pInfluence;
  heuristicScore = Math.max(0, Math.min(150, heuristicScore));

  // Model Prediction
  let modelScoreRaw = 0;
  let modelPredictionSuccessful = false;

  if (model && scaledMlFeatures && scaledMlFeatures.length === 16) {
      try {
          const tensor = tf.tensor2d([scaledMlFeatures], [1, 16]);
          
          let outputTensor: tf.Tensor;
          if (model instanceof tf.GraphModel) {
             // Use .execute() instead of .executeAsync() — our model has no
             // control-flow ops, so the synchronous path is correct and avoids
             // a noisy console.warn from TensorFlow.js.
             const result = model.execute(tensor) as tf.Tensor|tf.Tensor[];
             if(Array.isArray(result)) outputTensor = result[0];
             else outputTensor = result;
          } else {
             // Layers Model (predict returns Tensor)
             outputTensor = model.predict(tensor) as tf.Tensor;
          }

          const data = await outputTensor.data();
          modelScoreRaw = data[0];
          modelPredictionSuccessful = true;
          
          tensor.dispose();
          outputTensor.dispose();

      } catch (e) {
          console.error("TFJS Prediction Error", e);
      }
  }

  // Final Scoring
  let finalScore = heuristicScore;
  if (modelPredictionSuccessful) {
      const mlScoreScaled = modelScoreRaw * 100;
      if (heuristicScore < 30 && mlScoreScaled > 80) {
        finalScore = Math.min(50, (heuristicScore * 0.8) + (mlScoreScaled * 0.2));
      } else if (heuristicScore < 10 && mlScoreScaled > 70) {
        finalScore = (heuristicScore * 0.6) + (mlScoreScaled * 0.4);
      } else {
        finalScore = (heuristicScore * 0.3) + (mlScoreScaled * 0.7);
      }
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const mode = finalScore > 70 ? 'red' : finalScore >= 30 ? 'yellow' : 'green';

  return createResult(finalScore, mode, heuristicFeatures, false, url, modelPredictionSuccessful, heuristicScore, modelScoreRaw);
}

function createResult(score: number, mode: any, features: any, whitelisted: boolean, url: string, modelUsed: boolean, hScore: number, mScore: number): AnalysisResult {
    return {
        score,
        mode,
        features,
        whitelisted,
        url,
        modelUsed,
        heuristicScoreCalculated: hScore,
        modelPredictionRaw: mScore
    };
}
