import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import './CanvasModelMenu.css';

export default function CanvasModelMenu({ groups, currentModelKey, onSelect, onClose, getStatusColor }) {
  useUiLanguage()

    const [hoveredKey, setHoveredKey] = useState(null);
    const currentGroup = groups.find(([, group]) => group.models.some(model => (model._uid || model.id) === currentModelKey));
    const activeGroup = groups.find(([key]) => key === hoveredKey) || currentGroup || groups[0];
    const [activeKey, group] = activeGroup || [];

    return (
        <div className="canvas-model-menu" aria-label={uiText("选择生成模型")}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onWheel={event => event.stopPropagation()}
            onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            }}>
            <div className="canvas-model-menu__column canvas-model-menu__providers">
                <div className="canvas-model-menu__heading">{uiText("供应商") + " "}<span>{groups.length}</span></div>
                <div className="canvas-model-menu__list custom-scrollbar">
                    {groups.map(([key, provider]) => (
                        <button type="button" key={key} className="canvas-model-menu__provider"
                            aria-pressed={key === activeKey} title={provider.name || key}
                            onMouseEnter={() => setHoveredKey(key)}
                            onFocus={() => setHoveredKey(key)}
                            onClick={() => setHoveredKey(key)}>
                            <span>{provider.name || key}</span>
                            <ChevronRight size={12} />
                        </button>
                    ))}
                </div>
            </div>
            <div className="canvas-model-menu__column">
                <div className="canvas-model-menu__heading">{uiText("模型") + " "}<span>{group?.models.length || 0}</span></div>
                <div className="canvas-model-menu__list custom-scrollbar">
                    {group?.models.map(model => {
                        const key = model._uid || model.id;
                        const label = model.displayName || model.modelName || (/^studio-\d+$/.test(model.id) ? '未命名模型' : model.id);
                        const selected = key === currentModelKey;
                        return (
                            <button type="button" key={key} className="canvas-model-menu__model"
                                aria-pressed={selected} title={label} onClick={() => onSelect(model)}>
                                <span className={`canvas-model-menu__status ${getStatusColor(key)}`} />
                                <span className="canvas-model-menu__name">{label}</span>
                                {selected && <Check size={13} className="canvas-model-menu__check" />}
                            </button>
                        );
                    })}
                    {!group && <div className="canvas-model-menu__empty">{uiText("暂无可用模型")}</div>}
                </div>
            </div>
        </div>
    );
}
