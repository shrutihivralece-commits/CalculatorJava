document.addEventListener('DOMContentLoaded', () => {
    const previousOperandElement = document.getElementById('previous-operand');
    const currentOperandElement = document.getElementById('current-operand');
    const numberButtons = document.querySelectorAll('[data-number]');
    const operatorButtons = document.querySelectorAll('[data-operator]');
    const equalsButton = document.querySelector('[data-action="calculate"]');
    const clearButton = document.querySelector('[data-action="clear"]');
    const deleteButton = document.querySelector('[data-action="delete"]');
    const loadingOverlay = document.getElementById('loading-overlay');

    let currentOperand = '0';
    let previousOperand = '';
    let operation = undefined;
    let shouldResetDisplay = false;

    // Format numbers with commas (e.g., 1,000,000)
    function formatNumber(number) {
        if (number === '' || number === undefined || number === null) return '';
        if (number === 'Error') return 'Error';
        
        const stringNumber = number.toString();
        
        if (stringNumber === 'NaN') return 'Error';
        
        const integerDigits = parseFloat(stringNumber.split('.')[0]);
        const decimalDigits = stringNumber.split('.')[1];
        
        let integerDisplay;
        if (isNaN(integerDigits)) {
            integerDisplay = '';
        } else {
            integerDisplay = integerDigits.toLocaleString('en', { maximumFractionDigits: 0 });
            // Handle negative zero edge case manually if needed, but not common
        }
        
        // Handling negative sign before anything is typed
        if (stringNumber.startsWith('-') && integerDisplay === '0') {
             integerDisplay = '-0';
        }
        
        if (decimalDigits != null) {
            return `${integerDisplay}.${decimalDigits}`;
        } else {
            return integerDisplay;
        }
    }

    function updateDisplay() {
        if (currentOperand === 'Error') {
            currentOperandElement.innerText = 'Error';
            currentOperandElement.classList.add('error');
            return;
        }
        
        currentOperandElement.classList.remove('error');
        // Check if just standalone negative sign
        if (currentOperand === '-') {
            currentOperandElement.innerText = '-';
        } else {
            currentOperandElement.innerText = formatNumber(currentOperand);
        }
        
        if (operation != null) {
            previousOperandElement.innerText = `${formatNumber(previousOperand)} ${operation}`;
        } else {
            previousOperandElement.innerText = '';
        }
    }

    function clear() {
        currentOperand = '0';
        previousOperand = '';
        operation = undefined;
        shouldResetDisplay = false;
        updateDisplay();
    }

    function removeNumber() {
        if (shouldResetDisplay || currentOperand === 'Error') {
            clear();
            return;
        }
        if (currentOperand.length === 1 || (currentOperand.length === 2 && currentOperand.startsWith('-'))) {
             currentOperand = '0';
        } else {
            currentOperand = currentOperand.toString().slice(0, -1);
        }
        updateDisplay();
    }

    function appendNumber(number) {
        if (currentOperand === 'Error') clear();
        if (number === '.' && currentOperand.includes('.')) return;
        
        if (shouldResetDisplay) {
            currentOperand = number.toString();
            shouldResetDisplay = false;
        } else {
            if (currentOperand === '0' && number !== '.') {
                currentOperand = number.toString();
            } else {
                currentOperand = currentOperand.toString() + number.toString();
            }
        }
        updateDisplay();
    }

    function chooseOperation(op) {
        if (currentOperand === 'Error') clear();
        if (currentOperand === '') return;
        
        // Evaluate previous part if exists before chaining another operator
        if (previousOperand !== '') {
            computeLocal();
        }
        
        operation = op;
        previousOperand = currentOperand;
        currentOperand = '';
        shouldResetDisplay = false;
        updateDisplay();
    }

    // A fast local compute to visually hold values until final equals,
    // though the final complex expression is sent to Java
    function computeLocal() {
        let computation;
        const prev = parseFloat(previousOperand);
        const current = parseFloat(currentOperand);
        
        if (isNaN(prev) || isNaN(current)) return;
        
        switch (operation) {
            case '+':
                computation = prev + current;
                break;
            case '-':
                computation = prev - current;
                break;
            case '*':
                computation = prev * current;
                break;
            case '/':
                computation = current === 0 ? 'Error' : prev / current;
                break;
            default:
                return;
        }
        
        currentOperand = computation.toString();
        operation = undefined;
        previousOperand = '';
    }

    // Evaluates complex expressions via Java Backend API
    async function calculateFinal() {
        if (operation === undefined || currentOperand === '' || previousOperand === '') return;
        
        // Build the evaluation string. Assuming simple "A op B" for now, 
        // but the backend supports complex ones if users type them.
        const expressionToEvaluate = `${previousOperand}${operation}${currentOperand}`;
        
        loadingOverlay.classList.add('active');
        
        try {
            const response = await fetch('/api/calculate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ expression: expressionToEvaluate })
            });
            
            if (!response.ok) {
                throw new Error('Server returned computation error');
            }
            
            const data = await response.json();
            
            currentOperand = data.result.toString();
            shouldResetDisplay = true;
            operation = undefined;
            previousOperand = '';
            
            // Format number gracefully without extra zeros is done on backend or frontend
            if (currentOperand === 'NaN' || currentOperand === 'Infinity') {
                 currentOperand = 'Error';
            }
            
        } catch (error) {
            console.error('Calculation failed:', error);
            currentOperand = 'Error';
            shouldResetDisplay = true;
            operation = undefined;
            previousOperand = '';
        } finally {
            loadingOverlay.classList.remove('active');
            updateDisplay();
        }
    }

    // Event Listeners
    numberButtons.forEach(button => {
        button.addEventListener('click', () => {
            appendNumber(button.getAttribute('data-number'));
        });
    });

    operatorButtons.forEach(button => {
        button.addEventListener('click', () => {
            chooseOperation(button.getAttribute('data-operator'));
        });
    });

    equalsButton.addEventListener('click', calculateFinal);
    clearButton.addEventListener('click', clear);
    deleteButton.addEventListener('click', removeNumber);

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (e.key >= 0 && e.key <= 9 || e.key === '.') {
            appendNumber(e.key);
        }
        if (e.key === '=' || e.key === 'Enter') {
            e.preventDefault();
            calculateFinal();
        }
        if (e.key === 'Backspace') {
            removeNumber();
        }
        if (e.key === 'Escape') {
            clear();
        }
        if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
            chooseOperation(e.key);
        }
    });
    
    // Init state
    updateDisplay();
});
