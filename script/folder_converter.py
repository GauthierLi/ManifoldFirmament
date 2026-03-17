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


if __name__ == "__main__":
    import argparse
    import sys

    # 直接执行时将项目根目录加入路径
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from script.base_converter import BaseConverter, Record  # noqa: F811

    parser = argparse.ArgumentParser(
        description="FolderConverter - 按文件夹名称为图片打标签，输出路径+标签 txt 文件"
    )
    parser.add_argument(
        "source",
        type=str,
        help="包含分类子文件夹的根目录，每个子文件夹名将作为标签"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="output.txt",
        help="输出 txt 文件路径（默认：output.txt）"
    )
    parser.add_argument(
        "--recursive", "-r",
        action="store_true",
        default=False,
        help="递归扫描子文件夹内的嵌套目录（默认：仅扫描直接子目录）"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        default=False,
        help="写入前校验图片路径是否存在，跳过不存在的路径"
    )

    args = parser.parse_args()

    converter = FolderConverter(source=args.source, recursive=args.recursive)
    converter.convert(output_path=args.output, validate=args.validate)
