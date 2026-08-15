import { toast } from 'sonner'
import { AppToast } from '@/components/feedback/AppToast'
import type { IAppToastOptions, IAppToastTone } from '@/components/feedback/types'

function showAppToast(tone: IAppToastTone, message: string, options: IAppToastOptions = {}) {
  return toast.custom(
    (id) => <AppToast tone={tone} message={message} onClose={() => toast.dismiss(id)} />,
    {
      id: options.id,
      duration: options.duration ?? 3200,
      position: 'bottom-right',
    },
  )
}

export function showAppSuccessToast(message: string, options?: IAppToastOptions) {
  return showAppToast('success', message, options)
}

export function showAppInfoToast(message: string, options?: IAppToastOptions) {
  return showAppToast('info', message, options)
}
