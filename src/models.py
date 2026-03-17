"""
数据契约定义 - DINOv3 UMAP 可视化项目

所有模块通过这些数据模型进行通信，确保接口一致性。
"""

from dataclasses import dataclass, field
from typing import List, Optional
import numpy as np


@dataclass
class ImagePathEntry:
    """入口数据：单个图片路径"""
    path: str
    exists: bool = True


@dataclass
class ImagePathBatch:
    """入口数据：图片路径批次"""
    paths: List[str]
    source_file: str  # 原始 txt 文件路径
    labels: Optional[List[List[str]]] = None  # 每张图片对应的多标签列表，无标签时为 None
    
    def __len__(self):
        return len(self.paths)


@dataclass
class FeatureVector:
    """锚定点 1：DINOv3 特征"""
    image_path: str
    features: np.ndarray  # (D,) 高维特征
    model_version: str = "dinov3-base"
    
    @property
    def dimension(self) -> int:
        return self.features.shape[0]


@dataclass
class FeatureBatch:
    """锚定点 2：批量特征矩阵"""
    features: np.ndarray  # (N, D)
    paths: List[str]
    model_version: str = "dinov3-base"
    labels: Optional[List[List[str]]] = None  # 每张图片对应的多标签列表
    
    def __len__(self):
        return self.features.shape[0]
    
    @property
    def feature_dim(self) -> int:
        return self.features.shape[1]


@dataclass
class ReducedPoint:
    """锚定点 3：降维后的 3D 点"""
    x: float
    y: float
    z: float
    image_path: str
    original_index: int
    color: List[float] = field(default_factory=lambda: [1.0, 1.0, 1.0])  # RGB
    labels: Optional[List[str]] = None  # 多标签列表


@dataclass
class VisualizationData:
    """出口数据：前端可视化数据"""
    points: List[ReducedPoint]
    metadata: dict = field(default_factory=dict)
    
    @property
    def num_points(self) -> int:
        return len(self.points)
    
    def to_json_dict(self) -> dict:
        """转换为 JSON 可序列化格式"""
        def to_python_type(value):
            """将 numpy 类型转换为 Python 原生类型"""
            if isinstance(value, np.ndarray):
                return value.tolist()
            elif hasattr(value, 'item'):  # numpy 标量类型
                return value.item()
            elif isinstance(value, (list, tuple)):
                return [to_python_type(v) for v in value]
            elif isinstance(value, dict):
                return {k: to_python_type(v) for k, v in value.items()}
            return value
        
        def point_to_dict(p):
            d = {
                "x": float(p.x) if hasattr(p.x, 'item') else p.x,
                "y": float(p.y) if hasattr(p.y, 'item') else p.y,
                "z": float(p.z) if hasattr(p.z, 'item') else p.z,
                "image_path": p.image_path,
                "original_index": int(p.original_index) if hasattr(p.original_index, 'item') else p.original_index,
                "color": [float(c) if hasattr(c, 'item') else c for c in p.color]
            }
            if p.labels is not None:
                d["labels"] = p.labels
            return d
        
        return {
            "points": [point_to_dict(p) for p in self.points],
            "metadata": to_python_type(self.metadata)
        }
