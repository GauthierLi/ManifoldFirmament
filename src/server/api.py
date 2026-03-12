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
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
import uvicorn

app = FastAPI(title="DINOv3 UMAP 3D 可视化")

# 全局日志存储
processing_logs = []
processing_status = {
    "running": False,
    "completed": False,
    "last_update": None
}
log_lock = threading.Lock()

# 项目根目录
project_root = Path(__file__).parent.parent.parent
# 挂载静态文件
frontend_dir = Path(__file__).parent.parent / "frontend"
# output 目录在项目根目录，不是 src 目录下
output_dir = project_root / "output"
# 预设数据集目录
datasets_dir = project_root

# 确保输出目录存在
output_dir.mkdir(parents=True, exist_ok=True)

# 挂载前端静态文件
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

# 预设数据集列表
PRESET_DATASETS = [
    {"name": "test_paths.txt", "label": "test_paths.txt (50 张)"},
    {"name": "test_paths_2000.txt", "label": "test_paths_2000.txt (2000 张)"},
]


@app.get("/view", response_class=HTMLResponse)
async def view_page():
    """返回可视化页面"""
    html_file = frontend_dir / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    return HTMLResponse(content="<h1>前端文件不存在</h1><p>请运行处理流水线生成数据</p>")


@app.get("/api/data")
async def get_data(file: str = None):
    """获取可视化数据"""
    if file:
        # 指定文件名
        data_file = output_dir / file
        if not data_file.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"文件不存在：{file}"}
            )
    else:
        # 查找最新的 visualization_*.json 文件
        json_files = sorted(output_dir.glob("visualization_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        
        if not json_files:
            return JSONResponse(
                status_code=404,
                content={"error": "数据文件不存在，请先运行处理流水线"}
            )
        
        data_file = json_files[0]  # 最新的文件
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return JSONResponse(content=data)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@app.get("/api/log")
async def get_logs():
    """获取处理日志"""
    with log_lock:
        logs = processing_logs.copy()
        completed = processing_status["completed"]
    
    return {
        "logs": logs,
        "completed": completed,
        "running": processing_status["running"]
    }


def add_log(message: str):
    """添加日志"""
    with log_lock:
        processing_logs.append(message)
        processing_status["last_update"] = time.time()
        # 限制日志条数，最多保留 1000 条
        if len(processing_logs) > 1000:
            processing_logs.pop(0)


@app.get("/api/image")
async def get_image(path: str = Query(..., description="图片的绝对路径")):
    """代理本地图片文件，供前端加载"""
    image_path = Path(path)
    if not image_path.is_file():
        return JSONResponse(status_code=404, content={"error": "图片不存在"})
    return FileResponse(str(image_path))


@app.get("/api/datasets")
async def list_datasets():
    """获取可用数据集列表"""
    available = []
    for dataset in PRESET_DATASETS:
        dataset_path = datasets_dir / dataset["name"]
        if dataset_path.exists():
            available.append(dataset)
    return {"datasets": available}


@app.post("/api/process")
async def process_dataset(
    type: str = Form(...),
    dataset: str = Form(None),
    file: UploadFile = File(None)
):
    """处理数据集"""
    try:
        input_file = None
        output_name = "visualization.json"
        
        if type == "preset":
            # 使用预设数据集
            input_file = datasets_dir / dataset
            if not input_file.exists():
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "error": "数据集不存在"}
                )
            output_name = f"visualization_{Path(dataset).stem}.json"
        elif type == "upload":
            # 上传文件
            if file is None:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "error": "未上传文件"}
                )
            input_file = datasets_dir / f"uploaded_{file.filename}"
            with open(input_file, "wb") as f:
                content = await file.read()
                f.write(content)
            output_name = f"visualization_{Path(file.filename).stem}.json"
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "无效的类型"}
            )
        
        # ⭐ 检查输出文件是否已存在
        output_file = output_dir / output_name
        if output_file.exists():
            add_log(f"✅ 输出文件已存在：{output_name}，跳过处理")
            return JSONResponse(
                content={
                    "success": True,
                    "message": "数据已存在，无需重新处理",
                    "output": output_name,
                    "skipped": True
                }
            )
        
        # 启动后台处理进程
        
        # 清空之前的日志
        with log_lock:
            processing_logs.clear()
            processing_status["running"] = True
            processing_status["completed"] = False
        
        def run_processing():
            try:
                add_log(f"开始处理：{input_file.name}")
                add_log(f"输出文件：{output_name}")

                # 使用当前环境的Python和PATH
                python_path = sys.executable

                # 复制当前环境变量，确保PATH使用系统默认值
                env = os.environ.copy()
                env["PYTHONPATH"] = str(project_root)

                process = subprocess.Popen(
                    [
                        python_path,
                        str(project_root / "src" / "main.py"),
                        str(input_file),
                        "--output", str(output_file)
                    ],
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True
                )
                
                # 实时读取输出
                for line in process.stdout:
                    line = line.strip()
                    if line:
                        add_log(line)
                        print(line)  # 同时输出到服务器控制台
                
                process.wait()
                
                if process.returncode == 0:
                    add_log("✅ 处理完成！")
                    processing_status["completed"] = True
                else:
                    add_log(f"❌ 处理失败，退出码：{process.returncode}")
                    
            except subprocess.TimeoutExpired:
                add_log("❌ 处理超时")
                processing_status["completed"] = False
            except Exception as e:
                add_log(f"❌ 处理异常：{str(e)}")
                processing_status["completed"] = False
            finally:
                processing_status["running"] = False
        
        # 后台线程运行
        thread = threading.Thread(target=run_processing)
        thread.start()
        
        return JSONResponse(
            content={
                "success": True,
                "message": "处理已启动",
                "output": output_name,
                "skipped": False
            }
        )
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


if __name__ == "__main__":
    print("=" * 50)
    print("🚀 启动可视化服务")
    print("=" * 50)
    print("访问地址：http://localhost:8000/view")
    print("数据接口：http://localhost:8000/api/data")
    print("\n按 Ctrl+C 停止服务")
    print("=" * 50)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
