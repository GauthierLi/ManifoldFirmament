"""
过滤器注册机

用法：
    from src.filters.registry import FilterRegistry
    from src.filters.base import BaseFilter

    @FilterRegistry.register
    class MyFilter(BaseFilter):
        ...

    # 获取所有已注册过滤器
    filters = FilterRegistry.all()

    # 按名称获取
    f = FilterRegistry.get("my_filter")
"""

from typing import Dict, List, Optional, Type

from .base import BaseFilter


class FilterRegistry:
    """过滤器注册机：管理所有可用的过滤器"""

    _filters: Dict[str, BaseFilter] = {}

    @classmethod
    def register(cls, filter_cls: Type[BaseFilter]) -> Type[BaseFilter]:
        """
        注册一个过滤器类（可用作装饰器）。

        自动实例化并以 filter.name 为 key 存入注册表。
        """
        instance = filter_cls()
        cls._filters[instance.name] = instance
        return filter_cls

    @classmethod
    def get(cls, name: str) -> Optional[BaseFilter]:
        """按名称获取过滤器实例"""
        return cls._filters.get(name)

    @classmethod
    def all(cls) -> List[BaseFilter]:
        """返回所有已注册的过滤器实例"""
        return list(cls._filters.values())

    @classmethod
    def names(cls) -> List[str]:
        """返回所有已注册过滤器的名称"""
        return list(cls._filters.keys())
