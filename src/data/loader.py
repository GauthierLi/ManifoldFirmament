"""
数据加载模块 - 读取图片路径列表

用法：
    from src.data.loader import ImagePathLoader
    
    loader = ImagePathLoader()
    batch = loader.load("/path/to/paths.txt")
"""

from pathlib import Path
from typing import List
from src.models import ImagePathBatch


class ImagePathLoader:
    """从 txt 文件加载图片路径列表"""
    
    def load(self, txt_path: str) -> ImagePathBatch:
        """
        读取 txt 文件，返回图片路径批次
        
        Args:
            txt_path: txt 文件路径，每行一个图片路径
            
        Returns:
            ImagePathBatch 包含所有有效路径
            
        Raises:
            FileNotFoundError: txt 文件不存在
        """
        txt_file = Path(txt_path)
        if not txt_file.exists():
            raise FileNotFoundError(f"路径文件不存在：{txt_path}")
        
        paths: List[str] = []
        with open(txt_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):  # 跳过空行和注释
                    paths.append(line)
        
        return ImagePathBatch(paths=paths, source_file=str(txt_file))
    
    def validate_paths(self, batch: ImagePathBatch) -> ImagePathBatch:
        """
        验证图片路径是否存在，过滤不存在的路径
        
        Args:
            batch: 图片路径批次
            
        Returns:
            只包含有效路径的批次
        """
        valid_paths = [p for p in batch.paths if Path(p).exists()]
        invalid_count = len(batch.paths) - len(valid_paths)
        
        if invalid_count > 0:
            print(f"警告：{invalid_count} 个图片路径不存在，已过滤")
        
        return ImagePathBatch(paths=valid_paths, source_file=batch.source_file)
