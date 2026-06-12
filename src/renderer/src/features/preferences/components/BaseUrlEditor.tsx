import { Input } from '../../../components/ui/input'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export const BaseUrlEditor = ({ value, onChange, placeholder = 'https://api.openai.com/v1' }: Props): JSX.Element => {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-96"
    />
  )
}
