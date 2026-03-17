"""
DINOv3 特征提取模块

用法：
    from src.features.extractor import DINOv3FeatureExtractor
    
    extractor = DINOv3FeatureExtractor()
    features = extractor.extract(image_paths)
"""

import torch
from PIL import Image
from pathlib import Path
from typing import List, Optional
import numpy as np
from tqdm import tqdm

from src.models import FeatureBatch


# DINOv2 模型名称映射
DINOV2_MODELS = {
    "dinov3_base": "dinov2_vitb14",      # 224x224, 768 dims
    "dinov3_large": "dinov2_vitl14",     # 224x224, 1024 dims
    "dinov3_small": "dinov2_vits14",     # 224x224, 384 dims
    "dinov3_tiny": "dinov2_vitt14",      # 224x224, 192 dims
}


class DINOv3FeatureExtractor:
    """使用 DINOv3/DINOv2 预训练模型提取图片特征"""
    
    def __init__(self, model_name: str = "dinov2_vitb14", device: str = None):
        """
        初始化特征提取器
        
        Args:
            model_name: 模型名称 (dinov3_base, dinov3_large, dinov2_vitb14, etc.)
            device: 计算设备 (cuda/cpu)
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.transform = None
        
        # 模型名称映射
        if model_name in DINOV2_MODELS:
            self.dinov2_name = DINOV2_MODELS[model_name]
        else:
            self.dinov2_name = model_name
        
        print(f"使用设备：{self.device}")
    
    def load_model(self):
        """加载 DINOv3/DINOv2 预训练模型"""
        if self.model is not None:
            return
        
        print(f"加载模型：{self.model_name}...")
        
        # 优先尝试 DINOv3
        try:
            self.model = torch.hub.load('facebookresearch/dinov3', self.model_name)
            print("✓ DINOv3 加载成功")
        except Exception as e:
            print(f"DINOv3 加载失败，尝试 dinov2：{e}")
            # 备选方案：使用 DINOv2
            try:
                self.model = torch.hub.load('facebookresearch/dinov2', self.dinov2_name)
                self.model_name = self.dinov2_name
                print(f"✓ DINOv2 加载成功：{self.model_name}")
            except Exception as e2:
                print(f"DINOv2 加载失败：{e2}")
                raise RuntimeError(f"无法加载模型：{e2}")
        
        self.model.to(self.device)
        self.model.eval()
        
        # 使用模型的默认 transform
        if hasattr(self.model, 'transform'):
            self.transform = self.model.transform
        else:
            from torchvision import transforms
            self.transform = transforms.Compose([
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
        
        print(f"模型就绪：{self.model_name}")
    
    def preprocess_image(self, image_path: str) -> torch.Tensor:
        """预处理单张图片"""
        image = Image.open(image_path).convert('RGB')
        if self.transform:
            image_tensor = self.transform(image)
        else:
            # 简单预处理
            from torchvision import transforms
            transform = transforms.Compose([
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            image_tensor = transform(image)
        return image_tensor
    
    def extract(self, image_paths: List[str], batch_size: int = 32, labels: Optional[List[List[str]]] = None) -> FeatureBatch:
        """
        批量提取图片特征
        
        Args:
            image_paths: 图片路径列表
            batch_size: 批处理大小
            labels: 每张图片对应的标签列表，可选
            
        Returns:
            FeatureBatch 包含特征矩阵和路径
        """
        self.load_model()
        
        all_features = []
        valid_paths = []
        valid_labels = [] if labels is not None else None
        
        print(f"开始提取特征，共 {len(image_paths)} 张图片...")
        
        for i in tqdm(range(0, len(image_paths), batch_size), desc="提取特征"):
            batch_paths = image_paths[i:i + batch_size]
            batch_labels = labels[i:i + batch_size] if labels is not None else None
            batch_tensors = []
            batch_valid_indices = []
            
            for j, path in enumerate(batch_paths):
                try:
                    tensor = self.preprocess_image(path)
                    batch_tensors.append(tensor)
                    batch_valid_indices.append(j)
                except Exception as e:
                    print(f"跳过图片 {path}: {e}")
                    continue
            
            if not batch_tensors:
                continue
            
            batch_tensor = torch.stack(batch_tensors).to(self.device)
            
            with torch.no_grad():
                features = self.model(batch_tensor)
                # DINO 输出可能是 dict 或 tensor，需要处理
                if isinstance(features, dict):
                    features = features.get('x_norm_clstoken', features.get('features', list(features.values())[0]))
                features = features.cpu().numpy()
            
            all_features.append(features)
            for j in batch_valid_indices[:len(features)]:
                valid_paths.append(batch_paths[j])
                if valid_labels is not None:
                    valid_labels.append(batch_labels[j])
        
        # 合并所有批次的特征
        if all_features:
            feature_matrix = np.vstack(all_features)
        else:
            raise ValueError("未能提取任何特征")
        
        print(f"特征提取完成：{feature_matrix.shape}")
        
        return FeatureBatch(
            features=feature_matrix,
            paths=valid_paths,
            model_version=self.model_name,
            labels=valid_labels
        )
