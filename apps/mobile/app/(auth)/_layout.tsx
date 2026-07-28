import {Stack} from 'expo-router';

export default function AuthLayout() {
 return (
 <Stack screenOptions={{headerShown: false}}>
 <Stack.Screen name="login" />
 <Stack.Screen name="select-branch" />
 <Stack.Screen name="create-store" />
 </Stack>
 );
}
