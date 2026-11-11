export type IPasswordResetRequestApi = {
  email: string
}

export type IPasswordResetConfirmApi = {
  token: string
  newPassword: string
}

/**
 * Both actions report only what the form itself did. The request action deliberately has no "no account" branch:
 * the server answers the same way for every address, and the view must not invent a distinction it was not given.
 */
export type IForgotPasswordActionData = {
  request?: {
    ok: boolean
    error?: string
  }
}

export type IResetPasswordActionData = {
  reset?: {
    ok: boolean
    error?: string
  }
}
