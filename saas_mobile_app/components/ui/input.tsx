import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps, View, ViewStyle, Text } from 'react-native';

interface InputProps extends TextInputProps {
  containerStyle?: ViewStyle;
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  containerStyle,
  style,
  editable = true,
  label,
  error,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          isFocused && styles.focused,
          !editable && styles.disabled,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor="#9CA3AF"
        editable={editable}
        onFocus={(e) => {
          setIsFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 6,
    letterSpacing: -0.12,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8ED',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1D1D1F',
  },
  focused: {
    borderColor: '#0071E3',
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.4,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 4,
  },
});

export default Input;
