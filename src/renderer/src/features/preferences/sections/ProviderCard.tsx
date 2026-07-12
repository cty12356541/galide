/**
 * ProviderCard — single provider config form (API Key + Model + Base URL)
 */
import { ApiKeyEditor } from '../components/ApiKeyEditor'
import { ModelEditor } from '../components/ModelEditor'
import { BaseUrlEditor } from '../components/BaseUrlEditor'
import { PreferenceEditor } from '../components/PreferenceEditor'

export const ProviderCard = ({
  hasKey,
  model,
  modelOptions,
  baseUrl,
  onKeySaved,
  onKeyDeleted,
  onModelChange,
  onBaseUrlChange
}: {
  hasKey: boolean
  model: string
  modelOptions: string[]
  baseUrl: string
  onKeySaved: (key: string) => Promise<boolean>
  onKeyDeleted: () => Promise<boolean>
  onModelChange: (model: string) => void
  onBaseUrlChange: (url: string) => void
}): JSX.Element => (
  <div className="border border-border rounded-2xl p-4 bg-surface space-y-1 divide-y divide-border">
    <PreferenceEditor
      label="API Key"
      description={hasKey ? '已保存。删除后将清空。' : '粘贴服务商的 API Key'}
      vertical
      control={<ApiKeyEditor hasKey={hasKey} onSave={onKeySaved} onDelete={onKeyDeleted} />}
    />
    <PreferenceEditor
      label="模型"
      description="从下拉选,或输入自定义模型名"
      control={<ModelEditor value={model} options={modelOptions} onChange={onModelChange} />}
    />
    <PreferenceEditor
      label="Base URL"
      description="使用代理或本地网络映射端点(vLLM/LM Studio 等)时修改;本地端点可省略 Key"
      control={<BaseUrlEditor value={baseUrl} onChange={onBaseUrlChange} />}
    />
  </div>
)
