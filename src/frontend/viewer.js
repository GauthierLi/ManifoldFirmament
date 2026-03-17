/**
 * Three.js 3D 点云查看器
 * 
 * 功能：
 * - 加载可视化数据并渲染 3D 点云
 * - 支持旋转、缩放、平移
 * - 点击选点显示邻居图片卡片
 * - 自动旋转、截图等功能
 */

// ============================================================
// DraggablePanel - 统一的可拖动面板类
// ============================================================
class DraggablePanel {
    static instances = [];
    static snapDistance = 20;
    static activePanel = null;  // 当前正在拖动的面板

    /**
     * @param {HTMLElement} element - 面板 DOM 元素（需包含 .panel-header 子元素作为拖拽手柄）
     * @param {Object} options
     * @param {boolean} options.saveable - 是否持久化位置到 localStorage（默认 true）
     */
    constructor(element, options = {}) {
        this.element = element;
        this.saveable = options.saveable !== false;
        this._isDragging = false;
        this._isResizing = false;
        this._startX = 0;
        this._startY = 0;
        this._startLeft = 0;
        this._startTop = 0;
        this._resizeStartW = 0;
        this._resizeStartH = 0;

        this._bindEvents();
        this._initResize();
        DraggablePanel.instances.push(this);
    }

    _bindEvents() {
        const header = this.element.querySelector('.panel-header');
        if (!header) return;

        // 最小化按钮
        const minimizeBtn = this.element.querySelector('.panel-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.element.classList.toggle('minimized');
                minimizeBtn.textContent = this.element.classList.contains('minimized') ? '+' : '−';
            });
        }

        // 拖拽开始
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;

            this._isDragging = true;
            DraggablePanel.activePanel = this;

            const rect = this.element.getBoundingClientRect();
            this._startX = e.clientX;
            this._startY = e.clientY;
            this._startLeft = rect.left;
            this._startTop = rect.top;

            // 统一切换到 left/top 绝对定位
            this.element.style.left = rect.left + 'px';
            this.element.style.top = rect.top + 'px';
            this.element.style.right = 'auto';
            this.element.style.bottom = 'auto';
            this.element.style.transform = 'none';

            // 提升当前面板层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // 统一的 mousemove / mouseup（拖拽 + 缩放共用）
        this._onMouseMove = (e) => {
            if (this._isDragging) {
                const dx = e.clientX - this._startX;
                const dy = e.clientY - this._startY;
                this.element.style.left = (this._startLeft + dx) + 'px';
                this.element.style.top = (this._startTop + dy) + 'px';
                this._showSnapIndicator();
            }
            if (this._isResizing) {
                const newW = this._resizeStartW + (e.clientX - this._startX);
                const newH = this._resizeStartH + (e.clientY - this._startY);
                this.element.style.width = Math.max(150, newW) + 'px';
                this.element.style.height = Math.max(80, newH) + 'px';
                this.element.style.maxWidth = 'none';
                this.element.style.maxHeight = 'none';
            }
        };

        this._onMouseUp = () => {
            if (this._isDragging) {
                this._isDragging = false;
                DraggablePanel.activePanel = null;
                const indicator = document.querySelector('.snap-indicator');
                if (indicator) indicator.remove();
                this._applySnap();
                if (this.saveable) DraggablePanel.savePositions();
            }
            if (this._isResizing) {
                this._isResizing = false;
                DraggablePanel.activePanel = null;
            }
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _initResize() {
        const handle = document.createElement('div');
        handle.className = 'panel-resize-handle';
        this.element.appendChild(handle);

        handle.addEventListener('mousedown', (e) => {
            this._isResizing = true;
            DraggablePanel.activePanel = this;

            this._startX = e.clientX;
            this._startY = e.clientY;
            this._resizeStartW = this.element.offsetWidth;
            this._resizeStartH = this.element.offsetHeight;

            // 提升层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'nwse-resize';
            e.preventDefault();
            e.stopPropagation();
        });
    }

    _showSnapIndicator() {
        const existing = document.querySelector('.snap-indicator');
        if (existing) existing.remove();

        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let snapPos = null;

        if (rect.left < sd)
            snapPos = { x: 0, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.right > vw - sd)
            snapPos = { x: vw - rect.width, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.top < sd)
            snapPos = { x: rect.left, y: 0, w: rect.width, h: rect.height };
        else if (rect.bottom > vh - sd - 60)
            snapPos = { x: rect.left, y: vh - rect.height - 60, w: rect.width, h: rect.height };

        if (snapPos) {
            const indicator = document.createElement('div');
            indicator.className = 'snap-indicator';
            indicator.style.left = snapPos.x + 'px';
            indicator.style.top = snapPos.y + 'px';
            indicator.style.width = snapPos.w + 'px';
            indicator.style.height = snapPos.h + 'px';
            document.body.appendChild(indicator);
        }
    }

    _applySnap() {
        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let newLeft = rect.left;
        let newTop = rect.top;

        if (rect.left < sd) newLeft = 20;
        else if (rect.right > vw - sd) newLeft = vw - rect.width - 20;

        if (rect.top < sd) newTop = 20;
        else if (rect.bottom > vh - sd - 60) newTop = vh - rect.height - 60;

        this.element.style.left = newLeft + 'px';
        this.element.style.top = newTop + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
    }

    destroy() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        const handle = this.element.querySelector('.panel-resize-handle');
        if (handle) handle.remove();
        const idx = DraggablePanel.instances.indexOf(this);
        if (idx !== -1) DraggablePanel.instances.splice(idx, 1);
    }

    // ---- 静态方法：全局位置管理 ----

    static savePositions() {
        const positions = {};
        DraggablePanel.instances.forEach(p => {
            if (p.saveable && p.element.id) {
                positions[p.element.id] = {
                    left: p.element.offsetLeft,
                    top: p.element.offsetTop
                };
            }
        });
        localStorage.setItem('panelPositions', JSON.stringify(positions));
    }

    static loadPositions() {
        const saved = localStorage.getItem('panelPositions');
        if (!saved) return;

        try {
            const positions = JSON.parse(saved);
            Object.keys(positions).forEach(id => {
                const panel = document.getElementById(id);
                if (panel && positions[id]) {
                    panel.style.left = positions[id].left + 'px';
                    panel.style.top = positions[id].top + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            });
        } catch (e) {
            console.error('加载面板位置失败:', e);
        }
    }
}

// ============================================================
// Viewer3D - 3D 点云查看器
// ============================================================
class Viewer3D {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.data = null;
        this.autoRotate = true;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // 点选交互
        this.selectedPointIndex = null;
        this.neighborRadius = 5.0;
        this.originalColors = null;
        this.pickMode = false;
        this._imageObserver = null;
        
        this.init();
        this.initDraggableWindows();
        this.initSelectionCard();
        this.initFilterCard();
        this.initDataPanel();
        
        setTimeout(() => DraggablePanel.loadPositions(), 100);
    }
    
    initDraggableWindows() {
        // 为所有静态面板创建 DraggablePanel 实例
        document.querySelectorAll('.draggable-panel').forEach(panel => {
            new DraggablePanel(panel);
        });
        
        this.addLayoutButton();
    }
    
    autoLayout() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        const layouts = [
            { id: 'info-panel', left: 20, top: 20 },
            { id: 'filter-card', left: 20, top: 260 },
            { id: 'data-panel', left: viewportWidth - 420, top: 20 },
            { id: 'log-panel', left: viewportWidth - 620, top: viewportHeight - 380 }
        ];
        
        layouts.forEach(layout => {
            const panel = document.getElementById(layout.id);
            if (panel) {
                panel.style.left = layout.left + 'px';
                panel.style.top = layout.top + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        });
        
        DraggablePanel.savePositions();
    }
    
    addLayoutButton() {
        const controls = document.getElementById('controls');
        if (!controls) return;
        
        const btnLayout = document.createElement('button');
        btnLayout.id = 'btn-layout';
        btnLayout.textContent = '📐 自动排版';
        btnLayout.addEventListener('click', () => this.autoLayout());
        controls.appendChild(btnLayout);
    }
    
    initDataPanel() {
        console.log('初始化数据面板...');
        
        this.logAutoScroll = true;
        this.logInterval = null;
        this.initLogPanel();
        
        console.log('初始化点选交互...');
        this.initPointSelection();

        try {
            const fileUpload = document.getElementById('file-upload');
            const serverPathInput = document.getElementById('server-path-input');
            const btnBrowse = document.getElementById('btn-browse');
            const btnLoad = document.getElementById('btn-load');

            if (!fileUpload || !serverPathInput || !btnBrowse || !btnLoad) {
                console.error('数据面板：必要元素未找到', { fileUpload, serverPathInput, btnBrowse, btnLoad });
                return;
            }

            // 两个输入源互斥
            fileUpload.addEventListener('change', () => {
                if (fileUpload.files.length > 0) {
                    serverPathInput.value = '';
                }
            });

            serverPathInput.addEventListener('input', () => {
                if (serverPathInput.value.trim()) {
                    fileUpload.value = '';
                }
            });

            // 文件浏览器弹窗
            const modal = document.getElementById('browse-modal');
            const browseList = document.getElementById('browse-list');
            const browseCurrentPath = document.getElementById('browse-current-path');
            const btnBrowseUp = document.getElementById('btn-browse-up');
            const btnBrowseCancel = document.getElementById('btn-browse-cancel');
            let browseParentPath = null;

            const browseTo = async (path) => {
                try {
                    browseList.innerHTML = '<div style="padding:20px;color:#9ca3af;text-align:center">加载中...</div>';
                    const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data.error) { alert(data.error); return; }

                    browseCurrentPath.textContent = data.current;
                    browseParentPath = data.parent;
                    btnBrowseUp.disabled = !data.parent;

                    browseList.innerHTML = '';
                    data.dirs.forEach(d => {
                        const el = document.createElement('div');
                        el.className = 'browse-item dir';
                        el.innerHTML = `<span class="icon">📁</span><span>${d.name}</span>`;
                        el.addEventListener('click', () => browseTo(d.path));
                        browseList.appendChild(el);
                    });
                    data.files.forEach(f => {
                        const el = document.createElement('div');
                        el.className = 'browse-item file';
                        el.innerHTML = `<span class="icon">📄</span><span>${f.name}</span>`;
                        el.addEventListener('click', () => {
                            serverPathInput.value = f.path;
                            fileUpload.value = '';
                            modal.classList.remove('open');
                        });
                        browseList.appendChild(el);
                    });

                    if (data.dirs.length === 0 && data.files.length === 0) {
                        browseList.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">此目录下没有子目录或 .txt 文件</div>';
                    }
                } catch (err) {
                    console.error('浏览目录失败:', err);
                    browseList.innerHTML = `<div style="padding:20px;color:#f87171;text-align:center">加载失败：${err.message}</div>`;
                }
            };

            if (modal && btnBrowseUp && btnBrowseCancel) {
                btnBrowse.addEventListener('click', () => {
                    const startPath = serverPathInput.value.trim() || null;
                    modal.classList.add('open');
                    browseTo(startPath);
                });

                btnBrowseUp.addEventListener('click', () => {
                    if (browseParentPath) browseTo(browseParentPath);
                });

                btnBrowseCancel.addEventListener('click', () => modal.classList.remove('open'));
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
            } else {
                console.error('浏览弹窗元素未找到', { modal, btnBrowseUp, btnBrowseCancel });
            }

            btnLoad.addEventListener('click', async () => {
                const uploadedFile = fileUpload.files[0];
                const serverPath = serverPathInput.value.trim();

                if (!uploadedFile && !serverPath) {
                    this.showStatus('请上传文件或指定服务器路径', 'error');
                    return;
                }

                this.setProcessing(true);
                this.clearLog();
                this.addLog('🚀 开始处理...', 'highlight');

                try {
                    let formData = new FormData();

                    if (serverPath) {
                        formData.append('type', 'server_path');
                        formData.append('server_path', serverPath);
                    } else {
                        formData.append('file', uploadedFile);
                        formData.append('type', 'upload');
                    }
                
                const response = await fetch('/api/process', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.skipped) {
                        this.addLog('✅ ' + result.message, 'success');
                        setTimeout(() => this.loadDataByFilename(result.output), 1000);
                    } else {
                        this.addLog('✅ 处理任务已启动，正在后台运行...', 'success');
                        this.startLogPolling(result.output);
                    }
                } else {
                    this.showStatus('❌ ' + result.error, 'error');
                    this.addLog('❌ ' + result.error, 'error');
                }
            } catch (error) {
                this.showStatus('❌ 处理失败：' + error.message, 'error');
                this.addLog('❌ ' + error.message, 'error');
            } finally {
                this.setProcessing(false);
            }
        });
        } catch (e) {
            console.error('数据面板初始化失败:', e);
        }
    }
    
    initLogPanel() {
        const btnLogScroll = document.getElementById('btn-log-scroll');
        const btnLogClear = document.getElementById('btn-log-clear');
        const btnLogCollapse = document.getElementById('btn-log-collapse');
        const logPanel = document.getElementById('log-panel');
        
        btnLogScroll.addEventListener('click', () => {
            this.logAutoScroll = !this.logAutoScroll;
            btnLogScroll.classList.toggle('active', this.logAutoScroll);
        });
        
        btnLogClear.addEventListener('click', () => {
            this.clearLog();
        });
        
        btnLogCollapse.addEventListener('click', () => {
            logPanel.classList.toggle('collapsed');
            btnLogCollapse.textContent = logPanel.classList.contains('collapsed') ? '📏' : '📐';
        });
    }
    
    // ---- 采点卡片：初始化时创建，始终可见 ----
    
    initSelectionCard() {
        const card = document.createElement('div');
        card.id = 'selection-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>🖼️ 相邻图片</span>
                <div style="display:flex;gap:4px;">
                    <button id="btn-pick" title="采点工具">🔍</button>
                    <button id="btn-clear-pick" title="清除选择">🗑️</button>
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content">
                <div class="card-radius-control">
                    <label>半径：<span id="radius-value">${this.neighborRadius.toFixed(1)}</span></label>
                    <input type="range" id="radius-slider" min="0.5" max="20" step="0.5" value="${this.neighborRadius}">
                </div>
                <div class="card-images" id="card-images">
                    <span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        
        new DraggablePanel(card, { saveable: false });
        
        // 采点工具开关
        document.getElementById('btn-pick').addEventListener('click', () => {
            this.togglePickMode();
        });
        
        // 清除选择
        document.getElementById('btn-clear-pick').addEventListener('click', () => {
            this.deselectPoint();
        });
        
        // 半径滑块
        document.getElementById('radius-slider').addEventListener('input', (e) => {
            this.neighborRadius = parseFloat(e.target.value);
            document.getElementById('radius-value').textContent = this.neighborRadius.toFixed(1);
            
            if (this.selectedPointIndex !== null) {
                const neighbors = this.findNeighbors(this.selectedPointIndex, this.neighborRadius);
                this.updateSelectionImages(neighbors);
                this.updatePointColors(neighbors);
            }
        });
    }
    
    togglePickMode() {
        this.pickMode = !this.pickMode;
        
        const btn = document.getElementById('btn-pick');
        btn.classList.toggle('active', this.pickMode);
        
        // 切换画布光标
        document.getElementById('canvas-container').classList.toggle('pick-mode', this.pickMode);
        
        // 退出采点模式时隐藏高亮点
        if (!this.pickMode && this._highlightPoint) {
            this._highlightPoint.visible = false;
        }
    }
    
    // ---- 过滤器卡片 ----
    
    initFilterCard() {
        this._filterData = null;      // 可用过滤器列表（从后端获取）
        this._activeFilter = null;    // 当前选中的过滤器名称
        this._filterParams = {};      // 当前参数值
        this._filteredIndices = null; // 当前过滤结果（null = 未过滤）
        
        const card = document.createElement('div');
        card.id = 'filter-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>🔖 数据过滤</span>
                <div style="display:flex;gap:4px;">
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content" style="padding:0;display:flex;flex-direction:column;">
                <div class="filter-select-row">
                    <label>过滤方法</label>
                    <select id="filter-method-select">
                        <option value="">-- 请选择 --</option>
                    </select>
                </div>
                <div class="filter-params" id="filter-params-container"></div>
                <div class="filter-actions">
                    <button id="btn-filter-apply">应用过滤</button>
                    <button id="btn-filter-reset">重置</button>
                </div>
                <div class="filter-status" id="filter-status"></div>
            </div>
        `;
        document.body.appendChild(card);
        
        new DraggablePanel(card, { saveable: true });
        
        // 过滤方法切换
        document.getElementById('filter-method-select').addEventListener('change', (e) => {
            this._activeFilter = e.target.value || null;
            this._filterParams = {};
            this._renderFilterParams();
        });
        
        // 应用过滤
        document.getElementById('btn-filter-apply').addEventListener('click', () => {
            this._applyFilter();
        });
        
        // 重置
        document.getElementById('btn-filter-reset').addEventListener('click', () => {
            this._resetFilter();
        });
    }
    
    /**
     * 数据加载完成后调用，向后端请求可用过滤器
     */
    async _loadFilters() {
        const card = document.getElementById('filter-card');
        if (!card) return;
        
        try {
            const res = await fetch('/api/filters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: this.data.points })
            });
            const result = await res.json();
            
            if (!result.has_labels || !result.filters || result.filters.length === 0) {
                card.classList.remove('visible');
                this._filterData = null;
                return;
            }
            
            this._filterData = result.filters;
            
            // 填充过滤方法下拉
            const select = document.getElementById('filter-method-select');
            select.innerHTML = '<option value="">-- 请选择 --</option>';
            result.filters.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.display_name;
                select.appendChild(opt);
            });
            
            // 重置状态
            this._activeFilter = null;
            this._filterParams = {};
            this._filteredIndices = null;
            document.getElementById('filter-params-container').innerHTML = '';
            document.getElementById('filter-status').textContent = '';
            
            card.classList.add('visible');
        } catch (err) {
            console.error('加载过滤器失败:', err);
            card.classList.remove('visible');
        }
    }
    
    /**
     * 根据当前选中的过滤器，渲染参数控件
     */
    _renderFilterParams() {
        const container = document.getElementById('filter-params-container');
        container.innerHTML = '';
        
        if (!this._activeFilter || !this._filterData) return;
        
        const filterInfo = this._filterData.find(f => f.name === this._activeFilter);
        if (!filterInfo) return;
        
        filterInfo.params.forEach(param => {
            const group = document.createElement('div');
            group.className = 'filter-param-group';
            
            const label = document.createElement('label');
            label.textContent = param.label;
            group.appendChild(label);
            
            switch (param.type) {
                case 'select':
                    this._renderSelectParam(group, param);
                    break;
                case 'multi_select':
                    this._renderMultiSelectParam(group, param);
                    break;
                case 'range':
                    this._renderRangeParam(group, param);
                    break;
                case 'text':
                    this._renderTextParam(group, param);
                    break;
            }
            
            container.appendChild(group);
        });
    }
    
    _renderSelectParam(group, param) {
        const select = document.createElement('select');
        select.style.cssText = 'width:100%;padding:7px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-size:13px;outline:none;';
        
        (param.options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            o.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (opt === param.default) o.selected = true;
            select.appendChild(o);
        });
        
        this._filterParams[param.key] = param.default || (param.options ? param.options[0] : '');
        select.addEventListener('change', () => {
            this._filterParams[param.key] = select.value;
        });
        
        group.appendChild(select);
    }
    
    _renderMultiSelectParam(group, param) {
        const options = param.options || [];
        const defaults = new Set(param.default || options);
        this._filterParams[param.key] = [...defaults];
        
        // 全选 / 全不选 按钮
        const actions = document.createElement('div');
        actions.className = 'filter-chip-actions';
        
        const btnAll = document.createElement('button');
        btnAll.textContent = '全选';
        
        const btnNone = document.createElement('button');
        btnNone.textContent = '全不选';
        
        const btnInvert = document.createElement('button');
        btnInvert.textContent = '反选';
        
        actions.appendChild(btnAll);
        actions.appendChild(btnNone);
        actions.appendChild(btnInvert);
        group.appendChild(actions);
        
        const grid = document.createElement('div');
        grid.className = 'filter-checkbox-grid';
        
        const chips = [];
        
        options.forEach(opt => {
            const chip = document.createElement('span');
            chip.className = 'filter-chip' + (defaults.has(opt) ? ' selected' : '');
            chip.textContent = opt;
            chip.dataset.value = opt;
            
            chip.addEventListener('click', () => {
                chip.classList.toggle('selected');
                this._syncMultiSelect(param.key, chips);
            });
            
            chips.push(chip);
            grid.appendChild(chip);
        });
        
        btnAll.addEventListener('click', () => {
            chips.forEach(c => c.classList.add('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        btnNone.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        btnInvert.addEventListener('click', () => {
            chips.forEach(c => c.classList.toggle('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        group.appendChild(grid);
    }
    
    _syncMultiSelect(key, chips) {
        this._filterParams[key] = chips
            .filter(c => c.classList.contains('selected'))
            .map(c => c.dataset.value);
    }
    
    _renderRangeParam(group, param) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = param.min ?? 0;
        slider.max = param.max ?? 100;
        slider.step = param.step ?? 1;
        slider.value = param.default ?? param.min ?? 0;
        slider.style.flex = '1';
        
        const valueLabel = document.createElement('span');
        valueLabel.style.cssText = 'color:#60a5fa;font-size:13px;font-weight:600;min-width:40px;text-align:right;';
        valueLabel.textContent = slider.value;
        
        this._filterParams[param.key] = parseFloat(slider.value);
        slider.addEventListener('input', () => {
            valueLabel.textContent = slider.value;
            this._filterParams[param.key] = parseFloat(slider.value);
        });
        
        row.appendChild(slider);
        row.appendChild(valueLabel);
        group.appendChild(row);
    }
    
    _renderTextParam(group, param) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = param.label || '';
        input.value = param.default || '';
        
        this._filterParams[param.key] = input.value;
        input.addEventListener('input', () => {
            this._filterParams[param.key] = input.value;
        });
        
        group.appendChild(input);
    }
    
    async _applyFilter() {
        if (!this._activeFilter) return;
        
        const statusEl = document.getElementById('filter-status');
        statusEl.textContent = '过滤中...';
        
        try {
            const res = await fetch('/api/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filter_name: this._activeFilter,
                    params: this._filterParams,
                    points: this.data.points
                })
            });
            const result = await res.json();
            
            if (result.error) {
                statusEl.textContent = '过滤失败：' + result.error;
                return;
            }
            
            this._filteredIndices = new Set(result.indices);
            // 清除当前选点（选中的点或邻居可能被过滤掉），deselectPoint 会自动应用过滤着色
            this.deselectPoint();
            
            statusEl.innerHTML = `显示 <span class="count">${result.filtered}</span> / ${result.total} 个点`;
        } catch (err) {
            console.error('应用过滤失败:', err);
            statusEl.textContent = '过滤失败：' + err.message;
        }
    }
    
    _resetFilter() {
        this._filteredIndices = null;
        // 清除当前选点，恢复全部颜色
        this.deselectPoint();
        document.getElementById('filter-status').textContent = '';
        
        // 重置下拉
        const select = document.getElementById('filter-method-select');
        if (select) select.value = '';
        this._activeFilter = null;
        this._filterParams = {};
        document.getElementById('filter-params-container').innerHTML = '';
    }
    
    _applyFilterToPointCloud() {
        if (!this.points || !this._filteredIndices) return;
        
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        const positions = this.points.geometry.attributes.position;
        
        for (let i = 0; i < colors.count; i++) {
            if (this._filteredIndices.has(i)) {
                colors.setXYZ(i,
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            } else {
                colors.setXYZ(i, 0.08, 0.08, 0.08);
            }
        }
        
        colors.needsUpdate = true;
    }
    
    _restoreAllPointVisibility() {
        if (!this.points || !this.points.userData.originalColors) return;
        
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        
        for (let i = 0; i < colors.count; i++) {
            colors.setXYZ(i,
                originalColors[i * 3],
                originalColors[i * 3 + 1],
                originalColors[i * 3 + 2]
            );
        }
        colors.needsUpdate = true;
    }
    
    // ---- 点击交互：仅在采点模式下生效 ----
    
    initPointSelection() {
        // 使用 pointerdown/pointerup 代替 click，避免 OrbitControls 微量拖拽吞掉 click 事件
        let pointerDownPos = null;
        
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (!this.pickMode) return;
            pointerDownPos = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('pointerup', (e) => {
            if (!this.pickMode || !pointerDownPos) return;
            if (DraggablePanel.activePanel) { pointerDownPos = null; return; }
            
            // 移动超过 5px 视为拖拽，不触发选点
            const dx = e.clientX - pointerDownPos.x;
            const dy = e.clientY - pointerDownPos.y;
            pointerDownPos = null;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return;
            
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.params.Points.threshold = 0.5;
            
            if (this.points) {
                const intersects = this.raycaster.intersectObject(this.points);
                
                const index = this._pickClosestToRay(intersects);
                if (index >= 0) {
                    this.selectPoint(index);
                }
            }
        });
        
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    selectPoint(index) {
        this.selectedPointIndex = index;
        
        const neighbors = this.findNeighbors(index, this.neighborRadius);
        this.updateSelectionImages(neighbors);
        this.updatePointColors(neighbors);
    }
    
    /**
     * 从 raycaster 交点列表中，选出视觉上最接近鼠标的有效点。
     * 按 distanceToRay（射线垂直距离）排序，而非按 distance（相机距离）排序。
     * @returns {number} 点索引，无命中返回 -1
     */
    _pickClosestToRay(intersects) {
        let bestIndex = -1;
        let bestDist = Infinity;
        
        for (const hit of intersects) {
            const idx = hit.instanceId !== undefined ? hit.instanceId : hit.index;
            // 跳过被过滤掉的点
            if (this._filteredIndices && !this._filteredIndices.has(idx)) continue;
            
            if (hit.distanceToRay < bestDist) {
                bestDist = hit.distanceToRay;
                bestIndex = idx;
            }
        }
        
        return bestIndex;
    }
    
    findNeighbors(centerIndex, radius) {
        const centerPoint = this.points.userData.pointsData[centerIndex];
        const neighbors = [centerIndex];
        
        this.points.userData.pointsData.forEach((p, i) => {
            if (i === centerIndex) return;
            // 过滤器激活时，只在过滤后的点集中查找邻居
            if (this._filteredIndices && !this._filteredIndices.has(i)) return;
            
            const dx = p.x - centerPoint.x;
            const dy = p.y - centerPoint.y;
            const dz = p.z - centerPoint.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance <= radius) {
                neighbors.push(i);
            }
        });
        
        return neighbors;
    }
    
    updateSelectionImages(neighborIndices) {
        const imagesContainer = document.getElementById('card-images');
        if (!imagesContainer) return;
        
        // 清理旧的 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
        }
        
        imagesContainer.innerHTML = '';
        
        neighborIndices.forEach(idx => {
            const p = this.points.userData.pointsData[idx];
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'neighbor-image-wrapper';
            
            // 懒加载：先不设 src，用 data-src 暂存
            const img = document.createElement('img');
            img.dataset.src = '/api/image?path=' + encodeURIComponent(p.image_path);
            img.alt = `Image ${p.original_index}`;
            img.title = p.image_path;
            img.onerror = () => {
                imgWrapper.style.background = '#333';
                imgWrapper.textContent = `点 ${p.original_index}`;
            };
            
            imgWrapper.appendChild(img);
            imagesContainer.appendChild(imgWrapper);
        });
        
        // 用 IntersectionObserver 按需加载可见区域的图片
        this._imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                        this._imageObserver.unobserve(img);
                    }
                }
            });
        }, {
            root: imagesContainer,    // 以滚动容器为视口
            rootMargin: '0px 300px',  // 提前 300px 预加载
            threshold: 0
        });
        
        imagesContainer.querySelectorAll('img[data-src]').forEach(img => {
            this._imageObserver.observe(img);
        });
    }
    
    updatePointColors(neighborIndices) {
        const neighborSet = new Set(neighborIndices);
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        
        for (let i = 0; i < colors.count; i++) {
            if (neighborSet.has(i)) {
                // 邻居点：显示原色
                colors.setXYZ(i, 
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            } else if (this._filteredIndices && !this._filteredIndices.has(i)) {
                // 被过滤掉的点：近黑色，不可交互
                colors.setXYZ(i, 0.08, 0.08, 0.08);
            } else {
                // 过滤集内但非邻居：灰色
                colors.setXYZ(i, 0.3, 0.3, 0.3);
            }
        }
        
        colors.needsUpdate = true;
    }
    
    deselectPoint() {
        this.selectedPointIndex = null;
        
        // 断开懒加载 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
            this._imageObserver = null;
        }
        
        // 恢复占位符
        const imagesContainer = document.getElementById('card-images');
        if (imagesContainer) {
            imagesContainer.innerHTML = '<span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>';
        }
        
        // 恢复点颜色：如果过滤器激活，恢复到过滤状态；否则恢复全部原色
        if (this.points && this.points.userData.originalColors) {
            if (this._filteredIndices) {
                this._applyFilterToPointCloud();
            } else {
                const colors = this.points.geometry.attributes.color;
                const originalColors = this.points.userData.originalColors;
                
                for (let i = 0; i < colors.count; i++) {
                    colors.setXYZ(i, 
                        originalColors[i * 3],
                        originalColors[i * 3 + 1],
                        originalColors[i * 3 + 2]
                    );
                }
                colors.needsUpdate = true;
            }
        }
    }
    
    addLog(message, type = 'info') {
        const logContent = document.getElementById('log-content');
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        line.textContent = `[${timestamp}] ${message}`;
        
        logContent.appendChild(line);
        
        if (this.logAutoScroll) {
            logContent.scrollTop = logContent.scrollHeight;
        }
    }
    
    clearLog() {
        const logContent = document.getElementById('log-content');
        logContent.innerHTML = '';
    }
    
    startLogPolling(outputFilename = null) {
        if (this.logInterval) {
            clearInterval(this.logInterval);
        }
        
        this.logInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/log');
                const result = await response.json();
                
                if (result.logs && result.logs.length > 0) {
                    result.logs.forEach(log => {
                        let type = 'info';
                        if (log.includes('✅') || log.includes('完成')) type = 'success';
                        else if (log.includes('❌') || log.includes('错误') || log.includes('Error')) type = 'error';
                        else if (log.includes('⚠️') || log.includes('Warning')) type = 'warning';
                        else if (log.includes('步骤') || log.includes('=')) type = 'highlight';
                        
                        this.addLog(log, type);
                    });
                }
                
                if (result.completed) {
                    clearInterval(this.logInterval);
                    this.addLog('🎉 处理完成！正在加载可视化...', 'success');
                    setTimeout(() => {
                        if (outputFilename) {
                            this.loadDataByFilename(outputFilename);
                        } else {
                            this.loadExistingData();
                        }
                    }, 1500);
                }
            } catch (error) {
                console.error('日志轮询失败:', error);
            }
        }, 1000);
    }
    
    stopLogPolling() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }
    
    showStatus(message, type = '') {
        const statusMsg = document.getElementById('status-msg');
        statusMsg.textContent = message;
        statusMsg.className = type;
    }
    
    setProcessing(isProcessing) {
        const processing = document.getElementById('processing');
        const btnLoad = document.getElementById('btn-load');
        const processingText = document.getElementById('processing-text');
        
        if (isProcessing) {
            processing.style.display = 'block';
            btnLoad.disabled = true;
            processingText.textContent = '处理中，请稍候...（约 10-20 分钟）';
        } else {
            processing.style.display = 'none';
            btnLoad.disabled = false;
        }
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 50);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(50, 50, 50);
        this.scene.add(pointLight);
        
        window.addEventListener('resize', () => this.onResize());
        
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        this.animate();
    }
    
    async loadExistingData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('没有现有数据');
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            document.getElementById('loading').style.display = 'none';
            this.addLog('✅ 已加载现有数据', 'success');
            this._loadFilters();
            
        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            this.addLog('📁 未找到现有数据，请选择数据集或上传文件', 'info');
        }
    }
    
    async loadDataByFilename(filename) {
        try {
            const response = await fetch(`/api/data?file=${encodeURIComponent(filename)}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
                this.points = null;
            }
            
            this.data = await response.json();
            
            if (!this.data || !this.data.points) {
                throw new Error('数据格式错误');
            }
            
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 数据加载完成：' + filename, 'success');
            this._loadFilters();
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    async loadData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 新数据加载完成', 'success');
            this._loadFilters();
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    createPointCloud() {
        const points = this.data.points;
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        points.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            
            colors[i * 3] = p.color[0];
            colors[i * 3 + 1] = p.color[1];
            colors[i * 3 + 2] = p.color[2];
            
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: false
        });
        
        this.points = new THREE.Points(geometry, material);
        this.points.userData = {
            pointsData: points,
            originalColors: colors.slice()
        };
        this.scene.add(this.points);
        
        // 悬停高亮点（采点模式下鼠标所在点放大 3 倍显示）
        if (this._highlightPoint) {
            this.scene.remove(this._highlightPoint);
        }
        const hlGeometry = new THREE.BufferGeometry();
        hlGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        hlGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
        const hlMaterial = new THREE.PointsMaterial({
            size: 6,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false   // 始终在最前面渲染
        });
        this._highlightPoint = new THREE.Points(hlGeometry, hlMaterial);
        this._highlightPoint.visible = false;
        this._highlightPoint.renderOrder = 999;
        this.scene.add(this._highlightPoint);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        this.points.position.set(-centerX, -centerY, -centerZ);
        this._highlightPoint.position.set(-centerX, -centerY, -centerZ);
        
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        this.camera.position.set(centerX, centerY, centerZ + maxDim * 1.5);
        this.controls.target.set(centerX, centerY, centerZ);
    }
    
    updateStats() {
        const meta = this.data.metadata;
        document.getElementById('stat-points').textContent = meta.n_points.toLocaleString();
        document.getElementById('stat-dim').textContent = meta.feature_dim;
        document.getElementById('stat-model').textContent = meta.model_version;
        document.getElementById('stat-neighbors').textContent = meta.umap_params.n_neighbors;
    }
    
    onMouseMove(event) {
        if (!this.pickMode || !this.points || !this._highlightPoint) {
            if (this._highlightPoint) this._highlightPoint.visible = false;
            return;
        }
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.params.Points.threshold = 0.5;
        
        const intersects = this.raycaster.intersectObject(this.points);
        
        // 按 distanceToRay 排序，选视觉上最接近鼠标的点
        const hitIndex = this._pickClosestToRay(intersects);
        
        if (hitIndex >= 0) {
            const p = this.points.userData.pointsData[hitIndex];
            const hlPos = this._highlightPoint.geometry.attributes.position;
            hlPos.setXYZ(0, p.x, p.y, p.z);
            hlPos.needsUpdate = true;
            
            // 使用该点的原始颜色
            const origColors = this.points.userData.originalColors;
            const hlCol = this._highlightPoint.geometry.attributes.color;
            hlCol.setXYZ(0, origColors[hitIndex * 3], origColors[hitIndex * 3 + 1], origColors[hitIndex * 3 + 2]);
            hlCol.needsUpdate = true;
            
            this._highlightPoint.visible = true;
        } else {
            this._highlightPoint.visible = false;
        }
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.autoRotate = this.autoRotate;
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    toggleRotate() {
        this.autoRotate = !this.autoRotate;
        document.getElementById('btn-rotate').classList.toggle('active', this.autoRotate);
    }
    
    resetView() {
        this.camera.position.set(0, 0, 50);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
    
    takeScreenshot() {
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.download = `screenshot_${new Date().getTime()}.png`;
        link.href = dataURL;
        link.click();
    }
}

// 初始化查看器
let viewer = null;

document.addEventListener('DOMContentLoaded', () => {
    viewer = new Viewer3D();
    
    document.getElementById('btn-rotate').addEventListener('click', () => {
        viewer.toggleRotate();
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        viewer.resetView();
    });
    
    document.getElementById('btn-screenshot').addEventListener('click', () => {
        viewer.takeScreenshot();
    });
});
