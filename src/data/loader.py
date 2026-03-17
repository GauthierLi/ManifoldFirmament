"""
数据加载模块 - 读取图片路径列表

支持两种 txt 格式：
    1. 纯图片路径：每行一个路径
       /path/to/image1.jpg
       /path/to/image2.jpg
       
    2. 路径 + 多标签：路径后空格分隔标签
       /path/to/image1.jpg 1 2 3
       /path/to/image2.jpg 4

用法：
    from src.data.loader import ImagePathLoader
    
    loader = ImagePathLoader()
    batch = loader.load("/path/to/paths.txt")
"""

from pathlib import Path
from typing import List, Optional, Tuple
from src.models import ImagePathBatch


class ImagePathLoader:
    """从 txt 文件加载图片路径列表"""
    
    @staticmethod
    def _parse_line(line: str) -> Tuple[str, Optional[List[str]]]:
        """
        解析单行内容，分离路径和标签
        
        支持格式：
            /path/to/image.jpg          -> ("/path/to/image.jpg", None)
            /path/to/image.jpg 1 2 3    -> ("/path/to/image.jpg", ["1", "2", "3"])
        
        Returns:
            (image_path, labels) 其中 labels 为 None 表示无标签
        """
        parts = line.split()
        image_path = parts[0]
        labels = parts[1:] if len(parts) > 1 else None
        return image_path, labels
    
    def load(self, txt_path: str) -> ImagePathBatch:
        """
        读取 txt 文件，返回图片路径批次
        
        Args:
            txt_path: txt 文件路径，每行一个图片路径（可选带标签）
            
        Returns:
            ImagePathBatch 包含所有有效路径和标签
            
        Raises:
            FileNotFoundError: txt 文件不存在
        """
        txt_file = Path(txt_path)
        if not txt_file.exists():
            raise FileNotFoundError(f"路径文件不存在：{txt_path}")
        
        paths: List[str] = []
        all_labels: List[Optional[List[str]]] = []
        has_any_labels = False
        
        with open(txt_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):  # 跳过空行和注释
                    image_path, labels = self._parse_line(line)
                    paths.append(image_path)
                    all_labels.append(labels)
                    if labels is not None:
                        has_any_labels = True
        
        return ImagePathBatch(
            paths=paths,
            source_file=str(txt_file),
            labels=all_labels if has_any_labels else None
        )
    
    def validate_paths(self, batch: ImagePathBatch) -> ImagePathBatch:
        """
        验证图片路径是否存在，过滤不存在的路径
        
        Args:
            batch: 图片路径批次
            
        Returns:
            只包含有效路径的批次
        """
        valid_paths = []
        valid_labels = [] if batch.labels is not None else None
        
        for i, p in enumerate(batch.paths):
            if Path(p).exists():
                valid_paths.append(p)
                if valid_labels is not None:
                    valid_labels.append(batch.labels[i])
        
        invalid_count = len(batch.paths) - len(valid_paths)
        if invalid_count > 0:
            print(f"警告：{invalid_count} 个图片路径不存在，已过滤")
        
        return ImagePathBatch(
            paths=valid_paths,
            source_file=batch.source_file,
            labels=valid_labels
        )
