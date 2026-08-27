declare module 'katex' {
    export type SymbolMode = 'math' | 'text'
    export type SymbolFont = 'main' | 'ams'
    export type SymbolFamily = 'accent-token' | 'bin' | 'close' | 'inner' | 'mathord' | 'op-token' | 'open' | 'punct' | 'rel' | 'spacing' | 'textord'

    export type SymbolEntry = {
        font: SymbolFont
        family: SymbolFamily
        replace: string | null
    }

    export type TreeAtom = {
        type: 'atom'
        mode: SymbolMode
        family: SymbolFamily | null
        text: string
    }

    export type TreeTextOrd = {
        type: 'textord'
        mode: SymbolMode
        text: string
    }

    export type TreeMathOrd = {
        type: 'mathord'
        mode: SymbolMode
        text: string
    }

    export type TreeOrdGroup = {
        type: 'ordgroup'
        body: TreeNode[]
    }

    export type TreeOp = {
        type: 'op'
        mode: SymbolMode
        name?: string        // a named operator (\sum, \lim); absent when the op is a body
        body?: TreeNode[]    // \overset, \underset and \stackrel stack on an arbitrary body
        symbol?: boolean
        limits?: boolean
        alwaysHandleSupSub?: boolean
        suppressBaseShift?: boolean
        parentIsSupSub?: boolean
    }

    export type TreeKern = {
        type: 'kern'
        mode: SymbolMode
        dimension: Measurement
    }

    export type TreeText = {
        type: 'text'
        body: TreeNode[]
        font?: string
    }

    export type TreeFont = {
        type: 'font'
        mode: SymbolMode
        font: string
        body: TreeNode
    }

    export type TreeSupSub = {
        type: 'supsub'
        base: TreeNode | null
        sup: TreeNode | null
        sub: TreeNode | null
    }

    export type TreeAccent = {
        type: 'accent'
        mode: SymbolMode
        label: string
        isStretchy: boolean
        isShifty: boolean
        base: TreeNode
    }

    export type TreeUnderline = {
        type: 'underline'
        mode: SymbolMode
        body: TreeNode
    }

    export type TreeOverline = {
        type: 'overline'
        mode: SymbolMode
        body: TreeNode
    }

    export type TreeStyling = {
        type: 'styling'
        style: 'display' | 'text' | 'script' | 'scriptscript'
        body: TreeNode[]
    }

    export type Measurement = {
        number: number
        unit: 'mu' | 'em' | 'ex' | 'pt' | 'mm' | 'cm' | 'in' | 'bp' | 'pc' | 'dd' | 'cc' | 'nd' | 'nc' | 'sp'
    }

    export type TreeColor = {
        type: 'color'
        mode: SymbolMode
        color: string
        body: TreeNode[]
    }

    export type TreeSizing = {
        type: 'sizing'
        mode: SymbolMode
        size: number  // 1 (\tiny) to 11 (\Huge); 6 is \normalsize
        body: TreeNode[]
    }

    export type TreeMathChoice = {
        type: 'mathchoice'
        mode: SymbolMode
        display: TreeNode[]
        text: TreeNode[]
        script: TreeNode[]
        scriptscript: TreeNode[]
    }

    export type TreePhantom = {
        type: 'phantom'
        mode: SymbolMode
        body: TreeNode[]
    }

    export type TreeHPhantom = {
        type: 'hphantom'
        mode: SymbolMode
        body: TreeNode
    }

    export type TreeVPhantom = {
        type: 'vphantom'
        mode: SymbolMode
        body: TreeNode
    }

    export type TreeSmash = {
        type: 'smash'
        mode: SymbolMode
        body: TreeNode
        smashHeight: boolean
        smashDepth: boolean
    }

    export type TreeRule = {
        type: 'rule'
        mode: SymbolMode
        shift?: Measurement | null
        width: Measurement
        height: Measurement
    }

    export type TreeRaiseBox = {
        type: 'raisebox'
        mode: SymbolMode
        dy: Measurement
        body: TreeNode
    }

    export type TreeEnclose = {
        type: 'enclose'
        mode: SymbolMode
        label: string
        backgroundColor?: string
        borderColor?: string
        body: TreeNode
    }

    export type TreeVCenter = {
        type: 'vcenter'
        mode: SymbolMode
        body: TreeNode
    }

    export type TreeHBox = {
        type: 'hbox'
        mode: SymbolMode
        body: TreeNode[]
    }

    export type TreePmb = {
        type: 'pmb'
        mode: SymbolMode
        mclass: 'mord' | 'mop' | 'mbin' | 'mrel' | 'mopen' | 'mclose' | 'mpunct' | 'minner'
        body: TreeNode[]
    }

    export type TreeCr = {
        type: 'cr'
        mode: SymbolMode
        newLine: boolean
        size?: Measurement | null
    }

    export type TreeVerb = {
        type: 'verb'
        mode: SymbolMode
        body: string
        star: boolean
    }

    export type TreeDelimSizing = {
        type: 'delimsizing'
        mode: SymbolMode
        size: 1 | 2 | 3 | 4
        mclass: 'mopen' | 'mclose' | 'mrel' | 'mord'
        delim: string
    }

    export type TreeArrayAlign = {
        type: 'align'
        align: 'l' | 'c' | 'r'
        pregap?: number
        postgap?: number
    }

    export type TreeArraySeparator = {
        type: 'separator'
        separator: string
    }

    export type TreeArrayCol = TreeArrayAlign | TreeArraySeparator

    export type TreeArray = {
        type: 'array'
        mode: SymbolMode
        body: TreeNode[][]
        cols?: TreeArrayCol[]
        arraystretch: number
        rowGaps: (Measurement | null)[]
        hLinesBeforeRow: boolean[][]
        addJot?: boolean
        hskipBeforeAndAfter?: boolean
        colSeparationType?: 'align' | 'alignat' | 'gather' | 'small' | 'CD'
        leqno?: boolean
    }

    export type TreeAccentUnder = {
        type: 'accentUnder'
        mode: SymbolMode
        label: string
        base: TreeNode
    }

    export type TreeXArrow = {
        type: 'xArrow'
        mode: SymbolMode
        label: string
        body: TreeNode
        below?: TreeNode | null
    }

    export type TreeOperatorName = {
        type: 'operatorname'
        mode: SymbolMode
        body: TreeNode[]
        alwaysHandleSupSub?: boolean
        limits?: boolean
        parentIsSupSub?: boolean
    }

    export type TreeHorizBrace = {
        type: 'horizBrace'
        mode: SymbolMode
        label: string
        isOver: boolean
        base: TreeNode
    }

    export type TreeGenFrac = {
        type: 'genfrac'
        mode: SymbolMode
        numer: TreeNode
        denom: TreeNode
        continued: boolean
        hasBarLine: boolean
        leftDelim?: string
        rightDelim?: string
        barSize?: Measurement
    }

    export type TreeSqrt = {
        type: 'sqrt'
        mode: SymbolMode
        body: TreeNode
        index: TreeNode | null
    }

    export type TreeLeftRight = {
        type: 'leftright'
        mode: SymbolMode
        body: TreeNode[]
        left: string
        right: string
    }

    export type TreeSpacing = {
        type: 'spacing'
        mode: SymbolMode
        text: string
    }

    export type TreeMClass = {
        type: 'mclass'
        mode: SymbolMode
        mclass: 'mord' | 'mop' | 'mbin' | 'mrel' | 'mopen' | 'mclose' | 'mpunct' | 'minner'
        body: TreeNode[]
        isCharacterBox: boolean
    }

    export type TreeLap = {
        type: 'lap'
        mode: SymbolMode
        alignment: 'llap' | 'rlap' | 'clap'
        body: TreeNode
    }

    export type TreeHtmlMathml = {
        type: 'htmlmathml'
        mode: SymbolMode
        html: TreeNode[]
        mathml: TreeNode[]
    }

    export type TreeNode =
        | TreeAtom
        | TreeSpacing
        | TreeMClass
        | TreeLap
        | TreeHtmlMathml
        | TreeTextOrd
        | TreeMathOrd
        | TreeOrdGroup
        | TreeOp
        | TreeKern
        | TreeText
        | TreeFont
        | TreeStyling
        | TreeAccent
        | TreeUnderline
        | TreeOverline
        | TreeArray
        | TreeHorizBrace
        | TreeAccentUnder
        | TreeXArrow
        | TreeOperatorName
        | TreeSupSub
        | TreeGenFrac
        | TreeSqrt
        | TreeLeftRight
        | TreeColor
        | TreeSizing
        | TreeMathChoice
        | TreePhantom
        | TreeHPhantom
        | TreeVPhantom
        | TreeSmash
        | TreeRule
        | TreeRaiseBox
        | TreeEnclose
        | TreeVCenter
        | TreeHBox
        | TreePmb
        | TreeCr
        | TreeVerb
        | TreeDelimSizing

    export type Tree = TreeNode[]

    export function __parse(tex: string, options?: any): Tree
    export function renderToString(tex: string, options?: Record<string, unknown>): string
}
