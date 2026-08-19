"""
Palm embedding extractor (Track B - CNN PyTorch/ONNX MobileNetV3).
Deep learning embedder utilizing MobileNetV3 backbone and trained projection head.
"""

import os
from typing import Optional

import cv2
import numpy as np


class PalmEmbedderCNN:
    def __init__(self, model_path: str = "mobilenet_v3_palm.pth", embedding_dim: int = 128):
        self.embedding_dim = embedding_dim
        self.model_path = model_path
        self.session = None
        self.torch_model = None

        if not os.path.exists(self.model_path) and os.path.exists(os.path.join(os.path.dirname(__file__), "..", "mobilenet_v3_palm.pth")):
            self.model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "mobilenet_v3_palm.pth"))

        if os.path.exists(self.model_path):
            try:
                import torch
                import torch.nn as nn
                import torchvision.models as models

                class PalmCNN(nn.Module):
                    def __init__(self, emb_dim=128):
                        super().__init__()
                        mob = models.mobilenet_v3_small(weights=None)
                        in_features = mob.classifier[0].in_features
                        mob.classifier = nn.Identity()
                        self.backbone = mob
                        self.projector = nn.Sequential(
                            nn.Linear(in_features, 256),
                            nn.ReLU(),
                            nn.Linear(256, emb_dim)
                        )

                    def forward(self, x):
                        feat = self.backbone(x)
                        out = self.projector(feat)
                        return out

                net = PalmCNN(embedding_dim)
                checkpoint = torch.load(self.model_path, map_location="cpu")
                if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                    net.load_state_dict(checkpoint["state_dict"], strict=True)
                elif isinstance(checkpoint, dict):
                    net.load_state_dict(checkpoint, strict=True)

                net.eval()
                self.torch_model = net
                print(f"[*] Loaded PyTorch CNN Palm Embedder with trained projection head from {self.model_path}")
            except Exception as e:
                print(f"[!] Failed to load PyTorch model {self.model_path}: {e}")
                self.torch_model = None

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        """Extracts CNN feature embedding from 224x224 BGR image."""
        rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (224, 224))
        normalized = (resized.astype(np.float32) / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        tensor_inp = np.transpose(normalized, (2, 0, 1))[np.newaxis, ...].astype(np.float32)

        if self.torch_model is not None:
            import torch
            with torch.no_grad():
                inp = torch.from_numpy(tensor_inp)
                out = self.torch_model(inp)[0].numpy()
        else:
            raise RuntimeError("PalmEmbedderCNN model not loaded")

        norm = float(np.linalg.norm(out))
        return (out / norm).astype(np.float32) if norm > 0 else out.astype(np.float32)
