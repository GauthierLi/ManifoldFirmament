#!/usr/bin/env python3
"""
FastAPI 可视化服务

用法：
    python src/server/api.py
    
访问：
    http://localhost:8000/view - 可视化界面
    http://localhost:8000/api/data - 获取可视化数据
"""

import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

app = FastAPI(title="DINOv3 UMAP 3D 可视化")

# 挂载静态文件
frontend_dir = Path(__file__).parent.parent / "frontend"
output_dir = Path(__file__).parent.parent / "output"

# 确保输出目录存在
output_dir.mkdir(parents=True, exist_ok=True)

# 挂载前端静态文件
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


@app.get("/view", response_class=HTMLResponse)
async def view_page():
    """返回可视化页面"""
    html_file = frontend_dir / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    return HTMLResponse(content="<h1>前端文件不存在</h1><p>请运行处理流水线生成数据</p>")


@app.get("/api/data")
async def get_data():
    """获取可视化数据"""
    data_file = output_dir / "visualization.json"
    
    if not data_file.exists():
        return JSONResponse(
            status_code=404,
            content={"error": "数据文件不存在，请先运行处理流水线"}
        )
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return JSONResponse(content=data)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


if __name__ == "__main__":
    print("=" * 50)
    print("🚀 启动可视化服务")
    print("=" * 50)
    print("访问地址：http://localhost:8000/view")
    print("数据接口：http://localhost:8000/api/data")
    print("\n按 Ctrl+C 停止服务")
    print("=" * 50)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
