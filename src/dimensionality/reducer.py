"""
UMAP 降维模块 - 将高维特征降维到 3D

用法：
    from src.dimensionality.reducer import UMAPReducer
    
    reducer = UMAPReducer()
    points_3d = reducer.reduce(feature_matrix)
"""

import numpy as np
import umap
from typing import Tuple
from src.models import FeatureBatch, ReducedPoint, VisualizationData


class UMAPReducer:
    """使用 UMAP 进行降维"""
    
    def __init__(
        self,
        n_components: int = 3,
        n_neighbors: int = 15,
        min_dist: float = 0.1,
        metric: str = "euclidean",
        random_state: int = 42
    ):
        """
        初始化 UMAP 降维器
        
        Args:
            n_components: 目标维度 (默认 3 用于 3D 可视化)
            n_neighbors: 邻居数量，影响局部/全局结构平衡
            min_dist: 最小距离，控制点的聚集程度
            metric: 距离度量方式
            random_state: 随机种子
        """
        self.n_components = n_components
        self.n_neighbors = n_neighbors
        self.min_dist = min_dist
        self.metric = metric
        self.random_state = random_state
        self.reducer = None
    
    def fit_reduce(self, features: np.ndarray) -> np.ndarray:
        """
        拟合并降维
        
        Args:
            features: 高维特征矩阵 (N, D)
            
        Returns:
            降维后的坐标 (N, 3)
        """
        print(f"开始 UMAP 降维：{features.shape} -> (N, {self.n_components})...")
        
        self.reducer = umap.UMAP(
            n_components=self.n_components,
            n_neighbors=self.n_neighbors,
            min_dist=self.min_dist,
            metric=self.metric,
            random_state=self.random_state,
            verbose=True
        )
        
        reduced = self.reducer.fit_transform(features)
        print(f"降维完成：{reduced.shape}")
        
        return reduced
    
    def reduce_batch(self, feature_batch: FeatureBatch) -> VisualizationData:
        """
        处理 FeatureBatch，返回可视化数据
        
        Args:
            feature_batch: 特征批次
            
        Returns:
            VisualizationData 包含 3D 点和元数据
        """
        reduced_coords = self.fit_reduce(feature_batch.features)
        
        # 生成颜色（基于坐标的简单着色）
        points = []
        for i, (path, coords) in enumerate(zip(feature_batch.paths, reduced_coords)):
            # 使用坐标生成颜色，让空间位置相近的点颜色相近
            color = [
                (coords[0] - reduced_coords[:, 0].min()) / (reduced_coords[:, 0].max() - reduced_coords[:, 0].min() + 1e-8),
                (coords[1] - reduced_coords[:, 1].min()) / (reduced_coords[:, 1].max() - reduced_coords[:, 1].min() + 1e-8),
                (coords[2] - reduced_coords[:, 2].min()) / (reduced_coords[:, 2].max() - reduced_coords[:, 2].min() + 1e-8),
            ]
            
            point_labels = feature_batch.labels[i] if feature_batch.labels is not None else None
            
            points.append(ReducedPoint(
                x=float(coords[0]),
                y=float(coords[1]),
                z=float(coords[2]),
                image_path=path,
                original_index=i,
                color=color,
                labels=point_labels
            ))
        
        metadata = {
            "n_points": len(points),
            "feature_dim": feature_batch.feature_dim,
            "model_version": feature_batch.model_version,
            "umap_params": {
                "n_neighbors": self.n_neighbors,
                "min_dist": self.min_dist,
                "metric": self.metric
            }
        }
        
        return VisualizationData(points=points, metadata=metadata)
