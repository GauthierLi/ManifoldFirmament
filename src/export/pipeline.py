"""
数据导出模块 - 将可视化数据导出为 JSON

用法：
    from src.export.pipeline import ExportPipeline
    
    exporter = ExportPipeline()
    exporter.export(viz_data, "output/visualization.json")
"""

import json
from pathlib import Path
from src.models import VisualizationData


class ExportPipeline:
    """导出可视化数据为 JSON 格式"""
    
    def export(self, viz_data: VisualizationData, output_path: str) -> str:
        """
        导出可视化数据
        
        Args:
            viz_data: 可视化数据
            output_path: 输出 JSON 文件路径
            
        Returns:
            实际保存的文件路径
        """
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        data_dict = viz_data.to_json_dict()
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data_dict, f, indent=2, ensure_ascii=False)
        
        print(f"数据已导出：{output_file} ({viz_data.num_points} 个点)")
        return str(output_file)
    
    def export_with_thumbnails(
        self,
        viz_data: VisualizationData,
        output_path: str,
        thumbnail_dir: str = None
    ) -> str:
        """
        导出带缩略图的可视化数据（可选扩展）
        
        Args:
            viz_data: 可视化数据
            output_path: 输出 JSON 文件路径
            thumbnail_dir: 缩略图保存目录
            
        Returns:
            实际保存的文件路径
        """
        # 基础版本先不支持缩略图，预留接口
        return self.export(viz_data, output_path)
