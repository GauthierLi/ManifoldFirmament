"""
过滤器基类

所有过滤器需继承 BaseFilter 并实现：
  - name: 过滤器唯一标识
  - display_name: 前端显示名称
  - get_params_schema(): 返回参数 schema，供前端动态渲染控件
  - apply(points, params): 返回过滤后的点索引列表
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseFilter(ABC):
    """过滤器基类"""

    @property
    @abstractmethod
    def name(self) -> str:
        """过滤器唯一标识"""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """前端显示名称"""
        ...

    @abstractmethod
    def get_params_schema(self, points: List[dict]) -> List[Dict[str, Any]]:
        """
        根据当前数据返回参数 schema，供前端动态渲染控件。

        每个参数为一个 dict，格式：
            {
                "key": "param_name",
                "label": "显示名称",
                "type": "select" | "range" | "text" | "multi_select",
                "options": [...],      # select / multi_select 时的可选项
                "min": 0, "max": 100, "step": 1,  # range 时的范围
                "default": ...         # 默认值
            }

        Args:
            points: 当前数据点列表（每个点为 dict，包含 x, y, z, image_path, labels 等）

        Returns:
            参数 schema 列表
        """
        ...

    @abstractmethod
    def apply(self, points: List[dict], params: Dict[str, Any]) -> List[int]:
        """
        执行过滤，返回符合条件的点索引列表。

        Args:
            points: 所有数据点
            params: 前端传来的参数值（key 与 get_params_schema 中一致）

        Returns:
            通过过滤的点索引列表
        """
        ...

    def to_dict(self, points: List[dict]) -> Dict[str, Any]:
        """序列化为前端所需的描述信息"""
        return {
            "name": self.name,
            "display_name": self.display_name,
            "params": self.get_params_schema(points),
        }
