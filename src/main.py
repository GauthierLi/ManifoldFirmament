#!/usr/bin/env python3
"""
DINOv3 UMAP 3D 可视化 - 主入口

用法：
    python src/main.py /path/to/image_paths.txt
    
示例：
    python src/main.py /home/gauthierli/data/subtype/train_images_dir/paths.txt
"""

import sys
import argparse
from pathlib import Path

from src.data.loader import ImagePathLoader
from src.features.extractor import DINOv3FeatureExtractor
from src.dimensionality.reducer import UMAPReducer
from src.export.pipeline import ExportPipeline


def main():
    parser = argparse.ArgumentParser(
        description="DINOv3 特征提取 + UMAP 降维 + 3D 可视化"
    )
    parser.add_argument(
        "input_txt",
        type=str,
        help="输入 txt 文件路径（每行一个图片路径）"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="output/visualization.json",
        help="输出 JSON 文件路径"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="dinov2_vitb14",
        help="模型版本 (dinov2_vitb14, dinov2_vitl14, etc.)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="特征提取批处理大小"
    )
    parser.add_argument(
        "--umap-neighbors",
        type=int,
        default=15,
        help="UMAP 邻居数量"
    )
    parser.add_argument(
        "--umap-dist",
        type=float,
        default=0.1,
        help="UMAP 最小距离"
    )
    
    args = parser.parse_args()
    
    # 1. 加载图片路径
    print("=" * 50)
    print("步骤 1: 加载图片路径")
    print("=" * 50)
    loader = ImagePathLoader()
    batch = loader.load(args.input_txt)
    batch = loader.validate_paths(batch)
    print(f"有效图片数量：{len(batch.paths)}")
    
    if len(batch.paths) == 0:
        print("错误：没有有效的图片路径")
        sys.exit(1)
    
    # 2. 提取特征
    print("\n" + "=" * 50)
    print("步骤 2: 提取 DINOv3 特征")
    print("=" * 50)
    extractor = DINOv3FeatureExtractor(model_name=args.model)
    feature_batch = extractor.extract(batch.paths, batch_size=args.batch_size)
    
    # 3. UMAP 降维
    print("\n" + "=" * 50)
    print("步骤 3: UMAP 降维到 3D")
    print("=" * 50)
    reducer = UMAPReducer(
        n_neighbors=args.umap_neighbors,
        min_dist=args.umap_dist
    )
    viz_data = reducer.reduce_batch(feature_batch)
    
    # 4. 导出结果
    print("\n" + "=" * 50)
    print("步骤 4: 导出可视化数据")
    print("=" * 50)
    exporter = ExportPipeline()
    output_file = exporter.export(viz_data, args.output)
    
    print("\n" + "=" * 50)
    print("✅ 处理完成！")
    print("=" * 50)
    print(f"输出文件：{output_file}")
    print(f"点数：{viz_data.num_points}")
    print("\n下一步：运行 'python src/server/api.py' 启动可视化服务")


if __name__ == "__main__":
    main()
