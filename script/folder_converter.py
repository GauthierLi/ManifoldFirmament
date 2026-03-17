"""
FolderConverter - 按文件夹名称为图片打标签

目录结构示例：
    source/
    ├── cat/
    │   ├── 001.jpg
    │   └── 002.jpg
    ├── dog/
    │   └── 003.jpg
    └── bird/
        ├── 004.jpg
        └── 005.png

转换结果：
    /abs/path/source/cat/001.jpg cat
    /abs/path/source/cat/002.jpg cat
    /abs/path/source/dog/003.jpg dog
    /abs/path/source/bird/004.jpg bird
    /abs/path/source/bird/005.png bird

多层嵌套时，图片所在的直接父目录名作为标签。

用法：
    from script.folder_converter import FolderConverter

    converter = FolderConverter(source="/path/to/image_folders")
    converter.convert("output.txt")
"""

from pathlib import Path
from typing import List, Set, Union

from script.base_converter import BaseConverter, Record

IMAGE_EXTENSIONS: Set[str] = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}


class FolderConverter(BaseConverter):
    """
    扫描 source 目录下的子文件夹，以文件夹名作为标签。

    只收集 source 直接子目录中的图片（不递归进更深层级），
    source 根目录下散落的图片会被忽略。
    """

    def __init__(self, source: Union[str, Path], recursive: bool = False):
        """
        Args:
            source:    包含分类子文件夹的根目录
            recursive: 是否递归扫描子文件夹内的嵌套目录
        """
        super().__init__(source)
        if not self.source.is_dir():
            raise NotADirectoryError(f"数据源不是目录：{self.source}")
        self.recursive = recursive

    def parse(self) -> List[Record]:
        records: List[Record] = []

        for subdir in sorted(self.source.iterdir()):
            if not subdir.is_dir():
                continue

            label = subdir.name
            pattern = "**/*" if self.recursive else "*"

            for filepath in sorted(subdir.glob(pattern)):
                if filepath.is_file() and filepath.suffix.lower() in IMAGE_EXTENSIONS:
                    records.append((str(filepath.resolve()), [label]))

        return records
