; DynStav NSIS custom uninstall page
; Replaces default uninstall welcome page with a custom page
; that offers to delete user data directories (unchecked by default)

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Macro definitions are just stored text - safe to define for both builds.
; They are only expanded when called (which only happens in uninstaller build).

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.cleanupPageCreate un.cleanupPageLeave
!macroend

!macro customUnInstall
  ${If} $cleanup == 1
    System::Call 'shell32::SHGetFolderPathW(p 0, i 0x001c, p 0, i 0, w .s)'
    Pop $localdir
    RMDir /r "$PROFILE\.dynstav"
    RMDir /r "$localdir\DynStav"
    RMDir /r "$APPDATA\dynstav"
    RMDir /r "$localdir\dynstav-updater"
  ${EndIf}
!macroend

!ifdef BUILD_UNINSTALLER

  Var cleanup
  Var localdir

  Function un.cleanupPageCreate
    !insertmacro MUI_HEADER_TEXT "清理选项" "选择是否删除 DynStav 的用户数据和配置文件"
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateLabel} 0 0 100% 24u "以下目录包含 DynStav 的配置、缓存和数据。$\r$\n默认卸载不会删除它们。"
    Pop $1

    ${NSD_CreateLabel} 0 30u 100% 12u "$PROFILE\.dynstav（配置文件）"
    Pop $1

    System::Call 'shell32::SHGetFolderPathW(p 0, i 0x001c, p 0, i 0, w .s)'
    Pop $localdir
    ${NSD_CreateLabel} 0 44u 100% 12u "$localdir\DynStav（数据库和日志）"
    Pop $1

    ${NSD_CreateLabel} 0 58u 100% 12u "$APPDATA\dynstav（应用缓存）"
    Pop $1
    ${NSD_CreateLabel} 0 72u 100% 12u "$localdir\dynstav-updater（更新缓存）"
    Pop $1

    ${NSD_CreateLabel} 0 92u 100% 12u "如果不再使用本软件，可以勾选下方选项一并删除："
    Pop $1

    ${NSD_CreateCheckbox} 0 110u 100% 12u "删除 DynStav 相关的所有用户目录和文件"
    Pop $cleanup

    nsDialogs::Show
  FunctionEnd

  Function un.cleanupPageLeave
    ${NSD_GetState} $cleanup $cleanup
  FunctionEnd

!endif
