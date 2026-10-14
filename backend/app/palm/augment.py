"""
Palm Image Augmentation.
Generates realistic variations (slight rotation, brightness, noise, scale)
for enrollment top-up when fewer real photos are provided during registration.
"""

from typing import List

import cv2
import numpy as np


def augment_palm_image(aligned_bgr: np.ndarray, n_variants: int = 5, seed: int = 42) -> List[np.ndarray]:
    """Generates `n_variants` augmented versions of an aligned 224x224 palm ROI."""
    rng = np.random.default_rng(seed)
    h, w = aligned_bgr.shape[:2]
    center = (w // 2, h // 2)
    variants = []

    for _ in range(n_variants):
        # 1. Subtle Rotation (-6 deg to +6 deg)
        angle = float(rng.uniform(-6.0, 6.0))
        # 2. Subtle Scale (0.95x to 1.05x)
        scale = float(rng.uniform(0.95, 1.05))

        M = cv2.getRotationMatrix2D(center, angle, scale)
        aug = cv2.warpAffine(
            aligned_bgr, M, (w, h),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101
        )

        # 3. Brightness & contrast jitter
        alpha = float(rng.uniform(0.90, 1.10))  # contrast
        beta = float(rng.uniform(-8.0, 8.0))    # brightness
        aug = cv2.convertScaleAbs(aug, alpha=alpha, beta=beta)

        # 4. Subtle Gaussian noise
        noise = rng.normal(0, 1.5, aug.shape).astype(np.float32)
        aug = np.clip(aug.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        variants.append(aug)

    return variants
