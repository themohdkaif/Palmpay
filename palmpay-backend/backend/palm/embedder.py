"""
Palm embedding extractor module supporting both CNN and HOG+PCA backbones.

Features:
  1. Contrast Limited Adaptive Histogram Equalization (CLAHE) lighting normalization.
  2. Pretrained MobileNetV2 Deep CNN feature extractor with fitted PCA subspace projection.
  3. Classical HOG+PCA embedder fallback for ablation study comparisons.
"""

import sys
import types
from typing import List, Optional, Union

import cv2
import numpy as np
from skimage.feature import hog
from sklearn.decomposition import PCA

# Patch missing lzma on MacOS pyenv environments if needed prior to torchvision import
if "lzma" not in sys.modules or not hasattr(sys.modules.get("lzma"), "open"):
    dummy_lzma = types.ModuleType("lzma")
    dummy_lzma.open = lambda *args, **kwargs: None
    sys.modules["lzma"] = dummy_lzma

import torch
import torchvision.models as models


def apply_clahe(aligned_bgr: np.ndarray) -> np.ndarray:
    """
    Apply Contrast Limited Adaptive Histogram Equalization (CLAHE) to the
    luminance channel of the aligned palm crop. Normalizes local contrast across
    bright, dim, and directional shadow lighting conditions.
    """
    lab = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)


class CnnPalmEmbedder:
    """
    Transfer-learning Deep CNN feature extractor based on pretrained MobileNetV2.
    Extracts 1280-D bottleneck features, normalizes them, and projects them onto a
    fitted PCA subspace mapping 1280-D -> 128-D unit embedding vector.
    """

    def __init__(self, embedding_dim: int = 128):
        self.embedding_dim = embedding_dim
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Load MobileNetV2 backbone pretrained on ImageNet
        weights = models.MobileNet_V2_Weights.DEFAULT
        backbone = models.mobilenet_v2(weights=weights)
        self.features = backbone.features.to(self.device)
        self.features.eval()

        self._pca: Optional[PCA] = None

    def _extract_1280d_features(self, aligned_bgr: np.ndarray) -> np.ndarray:
        # Step 1: Lighting Normalization via CLAHE
        normalized = apply_clahe(aligned_bgr)
        rgb = cv2.cvtColor(normalized, cv2.COLOR_BGR2RGB)
        
        # Resize to standard ImageNet input size 224x224
        if rgb.shape[:2] != (224, 224):
            rgb = cv2.resize(rgb, (224, 224), interpolation=cv2.INTER_AREA)

        # Convert to FloatTensor normalized [0, 1] with ImageNet mean/std (moved to self.device)
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float() / 255.0
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1).to(self.device)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1).to(self.device)
        tensor = (tensor.to(self.device) - mean) / std
        tensor = tensor.unsqueeze(0)

        with torch.no_grad():
            feat = self.features(tensor)
            pooled = torch.nn.functional.adaptive_avg_pool2d(feat, (1, 1)).flatten(1)
            return pooled[0].cpu().numpy().astype(np.float32)

    def fit(self, aligned_images: List[np.ndarray]) -> None:
        """
        Fit PCA projection mapping 1280-D MobileNetV2 features down to embedding_dim.
        Pads image set with augmented variants if fewer images than embedding_dim.
        """
        if len(aligned_images) < self.embedding_dim:
            from backend.palm.augment import augment_palm_image
            padded = list(aligned_images)
            n_needed = self.embedding_dim - len(aligned_images)
            per_img = max(1, -(-n_needed // len(aligned_images)))
            for i, img in enumerate(aligned_images):
                padded.extend(augment_palm_image(img, n_variants=per_img, seed=i))
            aligned_images = padded[:max(self.embedding_dim, len(padded))]

        feats = np.stack([self._extract_1280d_features(img) for img in aligned_images])
        self._pca = PCA(n_components=self.embedding_dim, whiten=True)
        self._pca.fit(feats)

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        feat = self._extract_1280d_features(aligned_bgr)
        if self._pca is not None:
            vec = self._pca.transform(feat.reshape(1, -1))[0]
        else:
            # Fallback projection if fit() hasn't been called yet
            np.random.seed(42)
            W = np.random.randn(len(feat), self.embedding_dim).astype(np.float32)
            W /= np.linalg.norm(W, axis=0)
            vec = feat @ W

        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    def save(self, path: str) -> None:
        import joblib
        joblib.dump(self._pca, path)

    def load(self, path: str) -> None:
        import joblib
        self._pca = joblib.load(path)


class HogPalmEmbedder:
    """
    Classical HOG + PCA Palm-print Texture Embedder.
    Maintained as an ablation baseline for paper evaluation comparisons.
    """

    def __init__(self, embedding_dim: int = 128):
        self.embedding_dim = embedding_dim
        self._pca: Optional[PCA] = None

    def _raw_hog_features(self, aligned_bgr: np.ndarray) -> np.ndarray:
        normalized = apply_clahe(aligned_bgr)
        gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
        features = hog(
            gray,
            orientations=9,
            pixels_per_cell=(16, 16),
            cells_per_block=(2, 2),
            block_norm="L2-Hys",
            feature_vector=True,
        )
        return features.astype(np.float32)

    def fit(self, aligned_images: List[np.ndarray]) -> None:
        if len(aligned_images) < self.embedding_dim:
            from backend.palm.augment import augment_palm_image
            padded = list(aligned_images)
            n_needed = self.embedding_dim - len(aligned_images)
            per_img = max(1, -(-n_needed // len(aligned_images)))
            for i, img in enumerate(aligned_images):
                padded.extend(augment_palm_image(img, n_variants=per_img, seed=i))
            aligned_images = padded[:max(self.embedding_dim, len(padded))]

        raw = np.stack([self._raw_hog_features(img) for img in aligned_images])
        self._pca = PCA(n_components=self.embedding_dim, whiten=True)
        self._pca.fit(raw)

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        if self._pca is None:
            raw = self._raw_hog_features(aligned_bgr)
            np.random.seed(42)
            proj_matrix = np.random.randn(len(raw), self.embedding_dim).astype(np.float32)
            proj_matrix /= np.linalg.norm(proj_matrix, axis=0)
            vec = raw @ proj_matrix
            norm = np.linalg.norm(vec)
            return vec / norm if norm > 0 else vec
        raw = self._raw_hog_features(aligned_bgr).reshape(1, -1)
        vec = self._pca.transform(raw)[0]
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

    def save(self, path: str) -> None:
        import joblib
        joblib.dump(self._pca, path)

    def load(self, path: str) -> None:
        import joblib
        self._pca = joblib.load(path)


# Unified Factory Interface
class PalmEmbedder:
    """
    Unified Palm Embedder interface.
    Allows single-line switching between MobileNetV2 CNN ('cnn') and HOG+PCA ('hog') backbones.
    """

    def __init__(self, embedding_dim: int = 128, embedder_type: str = "cnn"):
        self.embedder_type = embedder_type.lower()
        self.embedding_dim = embedding_dim

        if self.embedder_type == "cnn":
            self._engine = CnnPalmEmbedder(embedding_dim=embedding_dim)
        else:
            self._engine = HogPalmEmbedder(embedding_dim=embedding_dim)

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        return self._engine.embed(aligned_bgr)

    def fit(self, aligned_images: List[np.ndarray]) -> None:
        if hasattr(self._engine, "fit"):
            self._engine.fit(aligned_images)

    def load(self, path: str) -> None:
        if hasattr(self._engine, "load"):
            try:
                self._engine.load(path)
            except Exception:
                pass

    def save(self, path: str) -> None:
        if hasattr(self._engine, "save"):
            self._engine.save(path)
