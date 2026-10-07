# render.ps1 - Markdown rendering for build-law.ps1. Dot-sourced; not a CLI.
# Output is deterministic: no timestamp, group order from law.json, ids in ordinal order.

function Protect-Cell([string] $s) { return ($s -replace '\|', '\|') -replace '\r?\n', ' ' }

function Get-InstalledFlag($installed, $c) {
    # $null when no -Installed state was given: kit grades stand as declared.
    if ($null -eq $installed -or $null -eq $c.enforcedBy) { return $null }
    $kind = [string](Get-Prop $c.enforcedBy 'kind'); $ref = [string](Get-Prop $c.enforcedBy 'ref')
    switch ($kind) {
        'hook' {
            $name = [IO.Path]::GetFileNameWithoutExtension(($ref -split '#')[0])
            $hooks = Get-Prop $installed 'hooks'
            return [bool](Get-Prop $hooks $name)
        }
        'permission-rule' { return [bool](Get-Prop $installed 'rootSettings') }
        'doctor-claim'    { return [bool](Get-Prop $installed 'pointer') }
        'tool'            { return [bool](Get-Prop $installed 'pointer') }
        default           { return $true }
    }
}

function Get-EffectiveGrade($installed, $c) {
    $flag = Get-InstalledFlag $installed $c
    if ($flag -eq $false) { return @{ grade = 'HONOUR'; note = ' (mechanism not installed)' } }
    return @{ grade = $c.grade; note = '' }
}

function Format-Law($groups, $clauses, $installed) {
    $L = [Collections.Generic.List[string]]::new()
    $L.Add('# LAW')
    $L.Add('')
    $L.Add('Generated from `law.json` by `tools/law/build-law.ps1`. Do not edit by hand: the Doctor compares this file with a fresh build and goes RED on any difference.')
    $L.Add('')
    $L.Add('Every clause has a permanent id (cite the id, never a line number), one sentence that carries no values, one owning file that holds the full text and the numbers, and an enforcement grade that says whether a machine will stop you breaking it.')
    $L.Add('')
    $L.Add('- **DENY** a permission deny rule refuses unconditionally on its pattern')
    $L.Add('- **HOOK** a hook inspects the call and denies it; what it cannot see is written in the owning file')
    $L.Add('- **ADVISE** a hook injects context and the call proceeds')
    $L.Add('- **GATE** a machine stops and asks, or the Doctor goes RED: an ask rule, a Doctor claim, a tool refusal')
    $L.Add('- **BUILDABLE** the mechanism is specified and not shipped')
    $L.Add('- **OWNER** a standing ruling; no mechanism, and none should try')
    $L.Add('- **HONOUR** a request; nothing fires')

    $counts = [ordered]@{}
    foreach ($g in $script:GradeOrder) { $counts[$g] = 0 }

    foreach ($gp in $groups.PSObject.Properties) {
        $rows = @($clauses | Where-Object { $_.group -eq $gp.Name } | Sort-Object -Property @{ Expression = { $_.id }; Ascending = $true } -Culture '')
        if ($rows.Count -eq 0) { continue }
        $L.Add('')
        $L.Add("## $($gp.Name) - $($gp.Value)")
        $L.Add('')
        $L.Add('| id | grade | rule | owner |')
        $L.Add('|---|---|---|---|')
        foreach ($c in $rows) {
            $eff = Get-EffectiveGrade $installed $c
            $counts[$eff.grade]++
            $L.Add("| $($c.id) | $($eff.grade)$($eff.note) | $(Protect-Cell $c.rule) | ``$($c.owner)`` |")
        }
    }

    $L.Add('')
    $L.Add('## Summary')
    $L.Add('')
    $L.Add('| grade | count |')
    $L.Add('|---|---|')
    foreach ($g in $script:GradeOrder) { $L.Add("| $g | $($counts[$g]) |") }
    $L.Add("| total | $($clauses.Count) |")
    $L.Add('')
    return ($L -join "`n")
}
