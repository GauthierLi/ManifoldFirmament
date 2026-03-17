"""
类别过滤器 - 按标签类别筛选数据点
"""

from typing import Any, Dict, List

from .base import BaseFilter
from .registry import FilterRegistry


@FilterRegistry.register
class CategoryFilter(BaseFilter):

    @property
    def name(self) -> str:
        return "category"

    @property
    def display_name(self) -> str:
        return "按类别筛选"

    def get_params_schema(self, points: List[dict]) -> List[Dict[str, Any]]:
        # 收集所有出现过的标签值
        categories = set()
        for p in points:
            labels = p.get("labels")
            if labels:
                for l in labels:
                    categories.add(str(l))

        sorted_cats = sorted(categories)

        return [
            {
                "key": "categories",
                "label": "选择类别",
                "type": "multi_select",
                "options": sorted_cats,
                "default": sorted_cats,  # 默认全选
            }
        ]

    def apply(self, points: List[dict], params: Dict[str, Any]) -> List[int]:
        selected = set(str(c) for c in params.get("categories", []))
        if not selected:
            return list(range(len(points)))

        result = []
        for i, p in enumerate(points):
            labels = p.get("labels")
            if labels and any(str(l) in selected for l in labels):
                result.append(i)
        return result
