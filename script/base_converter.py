"""
数据格式转换基类 - 将不同来源的数据统一转换为 txt 格式

目标 txt 格式（与 src/data/loader.py 的 ImagePathLoader 对齐）：
    纯路径：
        /path/to/image1.jpg
        /path/to/image2.jpg

    路径 + 多标签（空格分隔）：
        /path/to/image1.jpg label_a label_b
        /path/to/image2.jpg label_c

用法：
    派生类需实现 parse() 方法，返回 (image_path, labels) 的列表。

    class MyConverter(BaseConverter):
        def parse(self):
            ...
            return [("/path/to/img.jpg", ["1", "2"]), ...]

    converter = MyConverter(source="/path/to/annotations.json")
    converter.convert("output.txt")
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional, Tuple, Union


# 单条记录：(图片路径, 标签列表)，labels 为 None 或空列表表示无标签
Record = Tuple[str, Optional[List[str]]]


class BaseConverter(ABC):
    """
    数据格式转换基类。

    子类职责：
        1. 在 __init__ 中接收数据源路径或配置
        2. 实现 parse() 返回标准化的 Record 列表
    """

    def __init__(self, source: Union[str, Path]):
        """
        Args:
            source: 数据源路径（文件或目录，由子类定义具体含义）
        """
        self.source = Path(source)
        if not self.source.exists():
            raise FileNotFoundError(f"数据源不存在：{self.source}")

    @abstractmethod
    def parse(self) -> List[Record]:
        """
        解析数据源，返回 (image_path, labels) 列表。

        Returns:
            每个元素为 (image_path, labels)：
                - image_path: 图片的绝对路径字符串
                - labels: 标签字符串列表，无标签时为 None
        """
        ...

    def convert(self, output_path: Union[str, Path], validate: bool = False) -> Path:
        """
        执行转换：解析数据源 -> 写入 txt 文件。

        Args:
            output_path: 输出 txt 文件路径
            validate:    若为 True，跳过图片路径不存在的记录

        Returns:
            实际写入的文件路径
        """
        records = self.parse()

        if validate:
            before = len(records)
            records = [(p, l) for p, l in records if Path(p).exists()]
            skipped = before - len(records)
            if skipped > 0:
                print(f"警告：{skipped} 条记录因图片不存在被跳过")

        if not records:
            raise ValueError("无有效记录可写入")

        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        with open(output, "w", encoding="utf-8") as f:
            for image_path, labels in records:
                line = image_path
                if labels:
                    line += " " + " ".join(str(l) for l in labels)
                f.write(line + "\n")

        print(f"已写入 {len(records)} 条记录 -> {output}")
        return output
